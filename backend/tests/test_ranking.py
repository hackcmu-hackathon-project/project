import unittest
from datetime import timedelta

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import ranking
from app.auth import Principal, current_user
from app.db import get_db
from app.routes import router


class RankingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().rove
        await self.db.items.insert_many([
            {"id": i, "city": "sf" if i < 40 else "nyc", "title": str(i), "hood": "Test"}
            for i in range(1, 42)
        ])
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[current_user] = lambda: Principal(sub="alice", name="Alice")
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def place(self, item_id, tier="loved", winner="new", sub="alice"):
        state = await ranking.start(self.db, sub, item_id, tier)
        while not state.done:
            state = await ranking.compare(self.db, sub, state.session_id, winner)
        return state

    async def test_http_flow_persists_order_and_notes(self):
        first = await self.client.post("/api/rank/start", json={"item_id": 1, "tier": "loved"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["score"], 9.0)
        second = await self.client.post("/api/rank/start", json={"item_id": 2, "tier": "loved"})
        session = second.json()["session_id"]
        done = await self.client.post("/api/rank/compare", json={"session_id": session, "winner": "new"})
        self.assertTrue(done.json()["done"])
        self.assertEqual(done.json()["rank"], 1)
        await self.client.patch("/api/rankings/2", json={"note": "Great"})
        rows = (await self.client.get("/api/rankings")).json()
        self.assertEqual([r["item_id"] for r in rows], [2, 1])
        self.assertEqual([r["score"] for r in rows], [10, 8])
        self.assertEqual(rows[0]["note"], "Great")
        replay = await self.client.post("/api/rank/compare", json={"session_id": session, "winner": "new"})
        self.assertEqual(replay.status_code, 404)

    async def test_move_repairs_source_tier_and_preserves_note(self):
        await self.place(1)
        await self.place(2)
        await self.client.patch("/api/rankings/2", json={"note": "Keep me"})
        await self.place(2, "liked")
        rows = {r["item_id"]: r for r in await ranking.ranked_items(self.db, "alice")}
        self.assertEqual(rows[1]["score"], 9)
        self.assertEqual(rows[2]["score"], 6.5)
        self.assertEqual(rows[2]["note"], "Keep me")

    async def test_delete_rescores_and_is_idempotent(self):
        await self.place(1)
        await self.place(2)
        for _ in range(2):
            response = await self.client.delete("/api/rankings/2")
            self.assertEqual(response.status_code, 204)
        rows = await ranking.ranked_items(self.db, "alice")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["score"], 9)

    async def test_users_and_cities_are_independent(self):
        await self.place(1, sub="bob")
        await self.place(40)
        state = await self.place(1)
        self.assertEqual((state.rank, state.total, state.score), (1, 1, 9))
        await self.client.delete("/api/rankings/1")
        self.assertEqual(len(await ranking.ranked_items(self.db, "bob")), 1)
        self.assertEqual(len(await ranking.ranked_items(self.db, "alice", "nyc")), 1)

    async def test_invalid_input_and_missing_item(self):
        for body in ({"item_id": 1, "tier": "bad"}, {"tier": "liked"}):
            self.assertEqual((await self.client.post("/api/rank/start", json=body)).status_code, 422)
        self.assertEqual((await self.client.post("/api/rank/start", json={"item_id": 999, "tier": "liked"})).status_code, 404)
        self.assertEqual((await self.client.post("/api/rank/compare", json={"session_id": "x", "winner": "bad"})).status_code, 422)

    async def test_foreign_expired_and_invalidated_sessions(self):
        await self.place(1, sub="bob")
        foreign = await ranking.start(self.db, "bob", 2, "loved")
        response = await self.client.post("/api/rank/compare", json={"session_id": foreign.session_id, "winner": "new"})
        self.assertEqual(response.status_code, 404)
        await self.place(1)
        expired = await ranking.start(self.db, "alice", 2, "loved")
        await self.db.rank_sessions.update_one({"_id": expired.session_id}, {"$set": {"created_at": ranking._now() - timedelta(hours=2)}})
        response = await self.client.post("/api/rank/compare", json={"session_id": expired.session_id, "winner": "new"})
        self.assertEqual(response.status_code, 404)
        stale = await ranking.start(self.db, "alice", 2, "loved")
        await self.place(3)
        response = await self.client.post("/api/rank/compare", json={"session_id": stale.session_id, "winner": "new"})
        self.assertEqual(response.status_code, 404)

    async def test_rounded_ties_preserve_comparison_order(self):
        for item_id in range(1, 31):
            await self.place(item_id)
        rows = await ranking.ranked_items(self.db, "alice")
        self.assertEqual([r["item_id"] for r in rows], list(range(30, 0, -1)))
        self.assertLess(len({r["score"] for r in rows}), len(rows))

    async def test_opponent_wins_and_reranking_same_tier(self):
        await self.place(1)
        await self.place(2, winner="opponent")
        await self.place(3, winner="opponent")
        await self.place(1, winner="opponent")
        rows = await ranking.ranked_items(self.db, "alice")
        self.assertEqual([r["item_id"] for r in rows], [2, 3, 1])
        self.assertEqual([r["score"] for r in rows], [10, 9, 8])


if __name__ == "__main__":
    unittest.main()
