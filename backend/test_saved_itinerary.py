"""Save/edit validation and authenticated route tests without a running database."""
import unittest
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from app.auth import Principal, current_user
from app.db import get_db
from app.routes import router


class Collection:
    def __init__(self, rows=()):
        self.rows = list(rows)

    def find(self, query, projection=None):
        rows = [r.copy() for r in self.rows if all(r.get(k) == v for k, v in query.items())]
        for row in rows:
            for key, include in (projection or {}).items():
                if not include:
                    row.pop(key, None)
        class Cursor:
            def sort(self, key, order):
                rows.sort(key=lambda r: r[key], reverse=order < 0)
                return self
            async def to_list(self, limit):
                return rows
        return Cursor()

    async def insert_one(self, doc):
        if any(r['_id'] == doc['_id'] for r in self.rows):
            raise DuplicateKeyError('duplicate')
        self.rows.append(doc)

    async def replace_one(self, query, doc):
        for n, row in enumerate(self.rows):
            if all(row.get(k) == v for k, v in query.items()):
                self.rows[n] = doc
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)


class SavedTripTests(unittest.TestCase):
    def setUp(self):
        self.db = SimpleNamespace(itineraries=Collection(), items=Collection([
            {'id': n, 'city': 'sf', 'title': f'Place {n}', 'hood': 'Mission'} for n in range(1, 7)
        ]))
        app = FastAPI()
        app.include_router(router)
        self.user = 'alice'
        app.dependency_overrides[current_user] = lambda: Principal(self.user, self.user)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)
        self.path = f'/api/itineraries/{uuid4()}'
        self.body = {'title': 'Weekend', 'city': 'sf', 'travel_mode': 'walking', 'revision': 0,
                     'days': [{'date': '2026-09-12', 'item_ids': [1, 2], 'notes': 'Meet at ten'}]}

    def test_create_reopen_edit_and_recompute_route(self):
        response = self.client.put(self.path, json=self.body)
        self.assertEqual(response.status_code, 200)
        saved = self.client.get('/api/itineraries').json()[0]
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(saved['days'][0]['notes'], 'Meet at ten')
        self.assertNotIn('owner', saved)
        self.body.update(revision=1, title='Updated weekend', travel_mode='driving')
        self.body['days'][0]['item_ids'] = [2, 1, 3]
        updated = self.client.put(self.path, json=self.body).json()
        self.assertEqual(updated['revision'], 2)
        self.assertEqual([s['item']['id'] for s in updated['days'][0]['stops']], [2, 1, 3])
        self.assertIn('travelmode=driving', updated['days'][0]['maps_url'])
        self.assertEqual(updated['days'][0]['activity_minutes'], 180)

    def test_private_and_stale_updates_rejected(self):
        self.client.put(self.path, json=self.body).raise_for_status()
        self.assertEqual(self.client.put(self.path, json=self.body).status_code, 409)
        self.user = 'bob'
        self.assertEqual(self.client.get('/api/itineraries').json(), [])
        self.body['revision'] = 1
        self.assertEqual(self.client.put(self.path, json=self.body).status_code, 409)
        self.user = 'alice'
        self.assertEqual(self.client.get('/api/itineraries').json()[0]['revision'], 1)
        self.client.put(self.path, json=self.body).raise_for_status()
        self.assertEqual(self.client.put(self.path, json=self.body).status_code, 409)

    def test_invalid_edits(self):
        for patch in [ {'title': '   '}, {'city': 'nyc'},
                       {'days': []}, {'days': [{'date': '2026-09-12', 'item_ids': [1, 1]}]},
                       {'days': [{'date': '2026-09-12', 'item_ids': [999]}]},
                       {'days': [{'date': '2026-09-12', 'item_ids': [1, 2, 3, 4, 5, 6]}]},
                       {'days': [{'date': '2026-09-12'}, {'date': '2026-09-14'}]} ]:
            with self.subTest(patch=patch):
                self.assertEqual(self.client.put(self.path, json={**self.body, **patch}).status_code, 422)
        self.assertEqual(self.client.get('/api/itineraries').json(), [])

    def test_generation_never_calls_gemini_and_verify_is_explicit(self):
        for name in ['follows', 'saves', 'rankings', 'users']:
            setattr(self.db, name, Collection())
        with patch('app.routes.gemini_planner.review_plan', new_callable=AsyncMock) as review:
            response = self.client.post('/api/itineraries/generate', json={
                'city': 'sf', 'start_date': '2026-09-12', 'end_date': '2026-09-12',
                'must_try_ids': [1], 'use_gemini': True,
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['days'][0]['stops'][0]['item']['id'], 1)
            review.assert_not_awaited()
            review.return_value = {'days': [], 'review': {'status': 'fallback', 'message': 'No key'}}
            response = self.client.post('/api/itineraries/verify', json=self.body)
            self.assertEqual(response.status_code, 200)
            review.assert_awaited_once()
            self.assertTrue(review.call_args.args[1].use_gemini)
            self.assertEqual(self.client.get('/api/itineraries').json(), [])

    def test_empty_day_can_be_saved(self):
        self.body['days'][0]['item_ids'] = []
        saved = self.client.put(self.path, json=self.body).json()
        self.assertIsNone(saved['days'][0]['maps_url'])
        self.assertEqual(saved['days'][0]['activity_minutes'], 0)


if __name__ == '__main__':
    unittest.main()
