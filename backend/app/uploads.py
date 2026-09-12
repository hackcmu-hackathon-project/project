"""User-supplied photos, stored in MongoDB.

Keeping the bytes in GridFS means the whole stack is one connection string —
no object store to provision for a demo — and the API can re-encode on the way
in so a 12 MP phone photo doesn't become a 12 MP download.
"""

import io

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from PIL import Image, ImageOps

MAX_BYTES = 8 * 1024 * 1024
MAX_EDGE = 1600
ACCEPTED = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def bucket(db: AsyncIOMotorDatabase) -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(db, bucket_name="photos")


def normalise(raw: bytes) -> bytes:
    """Re-encode to a sensible JPEG: honour EXIF rotation, cap the long edge."""
    try:
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file isn't an image we can read") from exc

    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=82, optimize=True, progressive=True)
    return out.getvalue()


async def store(db: AsyncIOMotorDatabase, item_id: int, raw: bytes, uploader: str) -> str:
    """Replace the item's uploaded photo and return the id to serve it by."""
    data = normalise(raw)

    async for old in bucket(db).find({"metadata.item_id": item_id}):
        await bucket(db).delete(old._id)

    file_id = await bucket(db).upload_from_stream(
        f"item-{item_id}.jpg",
        data,
        metadata={"item_id": item_id, "uploader": uploader, "content_type": "image/jpeg"},
    )
    return str(file_id)


async def read(db: AsyncIOMotorDatabase, item_id: int) -> bytes | None:
    async for doc in bucket(db).find({"metadata.item_id": item_id}).sort("uploadDate", -1).limit(1):
        stream = io.BytesIO()
        await bucket(db).download_to_stream(doc._id, stream)
        return stream.getvalue()
    return None


async def remove(db: AsyncIOMotorDatabase, item_id: int) -> None:
    async for doc in bucket(db).find({"metadata.item_id": item_id}):
        await bucket(db).delete(doc._id)
