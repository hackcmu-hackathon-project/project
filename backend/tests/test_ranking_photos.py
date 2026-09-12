import io
import unittest
from unittest.mock import patch

from bson import ObjectId
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient
from PIL import Image

from app.auth import Principal, current_user
from app.db import get_db
from app.ranking_photos import router


class Bucket:
    def __init__(self):
        self.files = {}

    async def upload_from_stream(self, name, data, metadata):
        key = ObjectId()
        self.files[key] = data
        return key

    async def delete(self, key):
        del self.files[key]

    async def download_to_stream(self, key, stream):
        stream.write(self.files[key])


class AlbumTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().rove
        await self.db.rankings.insert_one({'sub': 'alice', 'item_id': 1, 'tier': 'loved', 'score': 9})
        self.bucket = Bucket()
        self.patch = patch('app.ranking_photos.AsyncIOMotorGridFSBucket', return_value=self.bucket)
        self.patch.start()
        app = FastAPI()
        app.include_router(router, prefix='/api')
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[current_user] = lambda: Principal(sub='alice', name='Alice')
        self.client = AsyncClient(transport=ASGITransport(app), base_url='http://test')

    async def asyncTearDown(self):
        self.patch.stop()
        await self.client.aclose()

    def photo(self, color):
        raw = io.BytesIO()
        Image.new('RGB', (20, 20), color).save(raw, 'PNG')
        return ('files', ('photo.png', raw.getvalue(), 'image/png'))

    async def test_album_appends_serves_and_deduplicates_retries(self):
        files = [self.photo('red'), self.photo('blue')]
        response = await self.client.post('/api/rankings/1/photos', files=files)
        self.assertEqual(response.status_code, 200, response.text)
        urls = response.json()['photo_urls']
        self.assertEqual(len(urls), 2)
        retry = await self.client.post('/api/rankings/1/photos', files=files)
        self.assertEqual(retry.json()['photo_urls'], urls)
        appended = await self.client.post('/api/rankings/1/photos', files=[self.photo('green')])
        self.assertEqual(len(appended.json()['photo_urls']), 3)
        downloaded = await self.client.get(urls[0])
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(Image.open(io.BytesIO(downloaded.content)).format, 'JPEG')
        self.assertEqual(await self.db.items.count_documents({}), 0)
        await self.db.rankings.delete_many({})
        self.assertEqual((await self.client.get(urls[0])).status_code, 404)

    async def test_only_owner_can_attach_to_ranking(self):
        await self.db.rankings.insert_one({'sub': 'bob', 'item_id': 2})
        response = await self.client.post('/api/rankings/2/photos', files=[self.photo('red')])
        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.bucket.files)

    async def test_invalid_batch_writes_nothing(self):
        response = await self.client.post('/api/rankings/1/photos', files=[self.photo('red'), ('files', ('bad.png', b'bad', 'image/png'))])
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.bucket.files)
        response = await self.client.post('/api/rankings/1/photos', files=[('files', ('bad.txt', b'bad', 'text/plain'))])
        self.assertEqual(response.status_code, 415)

    async def test_limit_and_oversize(self):
        await self.db.rankings.update_one({'sub': 'alice'}, {'$set': {'photo_ids': ['existing'] * 10}})
        response = await self.client.post('/api/rankings/1/photos', files=[self.photo('red')])
        self.assertEqual(response.status_code, 422)
        response = await self.client.post('/api/rankings/1/photos', files=[('files', ('large.png', b'x' * (8 * 1024 * 1024 + 1), 'image/png'))])
        self.assertEqual(response.status_code, 413)
        self.assertFalse(self.bucket.files)


if __name__ == '__main__':
    unittest.main()
