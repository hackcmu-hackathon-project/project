"""Personal ranking albums, separate from the shared place cover photo."""
import hashlib
import io

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from .auth import Principal, current_user
from .db import get_db
from .uploads import ACCEPTED, MAX_BYTES, normalise

router = APIRouter()
MAX_PHOTOS = 10


def photo_urls(row):
    return [f'/api/ranking-photos/{id}' for id in row.get('photo_ids', [])]


@router.post('/rankings/{item_id}/photos')
async def add_photos(item_id: int, files: list[UploadFile] = File(...),
                     user: Principal = Depends(current_user), db=Depends(get_db)):
    owner = {'sub': user.sub, 'item_id': item_id}
    row = await db.rankings.find_one(owner)
    if not row:
        raise HTTPException(404, 'Rank this place before adding photos')
    if not 1 <= len(files) <= MAX_PHOTOS:
        raise HTTPException(422, 'Choose between 1 and 10 photos')
    # Validate the entire batch before writing anything.
    images = {}
    for file in files:
        if file.content_type not in ACCEPTED:
            raise HTTPException(415, 'Choose JPEG, PNG, WebP, or a supported phone image')
        raw = await file.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise HTTPException(413, 'Each photo must be under 8 MB')
        data = normalise(raw)
        digest = hashlib.sha256(data).hexdigest()
        if digest not in row.get('photo_hashes', []):
            images[digest] = data
    if len(row.get('photo_ids', [])) + len(images) > MAX_PHOTOS:
        raise HTTPException(422, 'A ranking can hold up to 10 photos')
    if not images:
        return {'photo_urls': photo_urls(row)}
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name='ranking_photos')
    ids = []
    try:
        for digest, data in images.items():
            id = await bucket.upload_from_stream('memory.jpg', data, metadata=owner)
            ids.append(id)
        # Compare-and-swap prevents concurrent batches exceeding the album limit.
        condition = {**owner, 'photo_ids': row['photo_ids']} if 'photo_ids' in row else {**owner, 'photo_ids': {'$exists': False}}
        updated = await db.rankings.update_one(condition, {'$push': {
            'photo_ids': {'$each': [str(id) for id in ids]},
            'photo_hashes': {'$each': list(images)},
        }})
        if not updated.matched_count:
            raise HTTPException(409, 'Your album changed. Retry adding these photos.')
    except Exception:
        for id in ids:
            await bucket.delete(id)
        raise
    return {'photo_urls': photo_urls(await db.rankings.find_one(owner))}


@router.get('/ranking-photos/{photo_id}')
async def get_photo(photo_id: str, db=Depends(get_db)):
    # Albums have the same visibility as ranking activity; removed rankings no longer serve photos.
    if not ObjectId.is_valid(photo_id) or not await db.rankings.find_one({'photo_ids': photo_id}):
        raise HTTPException(404, 'Photo unavailable')
    stream = io.BytesIO()
    await AsyncIOMotorGridFSBucket(db, bucket_name='ranking_photos').download_to_stream(ObjectId(photo_id), stream)
    return Response(stream.getvalue(), media_type='image/jpeg', headers={'Cache-Control': 'no-cache'})
