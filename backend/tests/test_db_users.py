import asyncio
from copy import deepcopy

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from app import db as db_module
from app import main as main_module
from app import routes
from app.auth import Principal


def run(awaitable):
    return asyncio.run(awaitable)


def _value(document, field):
    return document.get(field)


def _matches(document, query):
    for field, expected in query.items():
        if field == "$or":
            if not any(_matches(document, branch) for branch in expected):
                return False
            continue

        actual = _value(document, field)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$nin" in expected and actual in expected["$nin"]:
                return False
            if "$exists" in expected and (field in document) != expected["$exists"]:
                return False
            if "$regex" in expected:
                import re

                flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                if actual is None or re.search(expected["$regex"], str(actual), flags) is None:
                    return False
            continue
        if actual != expected:
            return False
    return True


class FakeCursor:
    def __init__(self, documents):
        self.documents = [deepcopy(document) for document in documents]

    def sort(self, field, direction):
        self.documents.sort(key=lambda document: document.get(field), reverse=direction < 0)
        return self

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    async def to_list(self, length):
        return deepcopy(self.documents[:length])


class FakeCollection:
    def __init__(self, *, unique_handle=False):
        self.documents = {}
        self.indexes = []
        self.unique_handle = unique_handle

    async def create_index(self, keys, **options):
        self.indexes.append((keys, options))
        return f"index-{len(self.indexes)}"

    def _check_unique_handle(self, document, *, replacing=None):
        if not self.unique_handle or not document.get("handle"):
            return
        for key, existing in self.documents.items():
            if key != replacing and existing.get("handle") == document["handle"]:
                raise DuplicateKeyError("duplicate handle")

    async def find_one(self, query, projection=None):
        document = next((document for document in self.documents.values() if _matches(document, query)), None)
        if document is None:
            return None
        document = deepcopy(document)
        if projection is None:
            return document
        include = {key for key, value in projection.items() if value and key != "_id"}
        exclude_id = projection.get("_id") == 0
        if include:
            projected = {key: document[key] for key in include if key in document}
            if not exclude_id and "_id" in document:
                projected["_id"] = document["_id"]
            return projected
        for key, value in projection.items():
            if value == 0:
                document.pop(key, None)
        return document

    def find(self, query, projection=None):
        documents = [document for document in self.documents.values() if _matches(document, query)]
        if projection is not None:
            documents = [self._project(document, projection) for document in documents]
        return FakeCursor(documents)

    def _project(self, document, projection):
        include = {key for key, value in projection.items() if value and key != "_id"}
        if include:
            output = {key: document[key] for key in include if key in document}
            if projection.get("_id", 1) and "_id" in document:
                output["_id"] = document["_id"]
            return output
        output = deepcopy(document)
        for key, value in projection.items():
            if value == 0:
                output.pop(key, None)
        return output

    async def update_one(self, query, update, *, upsert=False):
        key = next((key for key, document in self.documents.items() if _matches(document, query)), None)
        inserting = key is None and upsert
        if key is None and not inserting:
            return type("UpdateResult", (), {"matched_count": 0, "modified_count": 0})()

        if inserting:
            key = query.get("_id")
            if key is None:
                raise AssertionError("fake upserts in these tests require an _id")
            document = {"_id": key}
            document.update(deepcopy(update.get("$setOnInsert", {})))
        else:
            document = deepcopy(self.documents[key])

        document.update(deepcopy(update.get("$set", {})))
        self._check_unique_handle(document, replacing=None if inserting else key)
        self.documents[key] = document
        return type("UpdateResult", (), {"matched_count": 0 if inserting else 1, "modified_count": 1})()

    async def count_documents(self, query):
        return sum(_matches(document, query) for document in self.documents.values())


class FakeDatabase:
    def __init__(self):
        self.items = FakeCollection()
        self.rankings = FakeCollection()
        self.rank_sessions = FakeCollection()
        self.users = FakeCollection(unique_handle=True)
        self.follows = FakeCollection()
        self.feed_seed = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def make_api(database, principal):
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[routes.current_user] = lambda: principal
    app.dependency_overrides[routes.get_db] = lambda: database
    return app


def test_me_upserts_one_identity_and_is_idempotent():
    database = FakeDatabase()
    principal = Principal(sub="auth0|casey", name="Casey", email="casey@example.com", picture="avatar")
    app = make_api(database, principal)

    with TestClient(app) as client:
        first = client.get("/api/me")
        second = client.get("/api/me")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["sub"] == second.json()["sub"] == "auth0|casey"
    assert first.json()["handle"] == second.json()["handle"] == "casey"
    assert first.json()["new_user"] is True
    assert second.json()["new_user"] is False
    assert len(database.users.documents) == 1
    assert database.users.documents["auth0|casey"]["created_at"] < database.users.documents["auth0|casey"]["last_seen_at"]

def test_me_preserves_local_profile_when_auth_claims_are_missing():
    database = FakeDatabase()
    principal = Principal(sub="auth0|casey", name="Casey", email="casey@example.com", picture="avatar")
    app = make_api(database, principal)

    with TestClient(app) as client:
        assert client.get("/api/me").status_code == 200
        updated = client.patch(
            "/api/me",
            json={"name": "Casey Locally", "handle": "casey-local", "bio": "My places"},
        )
        assert updated.status_code == 200

        # A later token can still carry the original Auth0 name. The local
        # profile remains authoritative after the PATCH.
        assert client.get("/api/me").json()["name"] == "Casey Locally"

        # current_user falls back to "Traveler" when Auth0 omits name, so the
        # route must recognize that fallback as missing claim data too.
        app.dependency_overrides[routes.current_user] = lambda: Principal(
            sub="auth0|casey", name="Traveler", email=None, picture=None
        )
        response = client.get("/api/me")

    assert response.status_code == 200
    assert response.json()["name"] == "Casey Locally"
    assert response.json()["handle"] == "casey-local"
    assert response.json()["email"] == "casey@example.com"
    assert response.json()["picture"] == "avatar"
    assert response.json()["bio"] == "My places"


def test_me_patch_initializes_user_before_first_get():
    database = FakeDatabase()
    principal = Principal(sub="auth0|new", name="New Traveler", email="new@example.com", picture=None)
    app = make_api(database, principal)

    with TestClient(app) as client:
        response = client.patch("/api/me", json={"name": "Local Name", "bio": "First thing"})

    assert response.status_code == 200
    assert response.json()["_id"] == "auth0|new"
    assert response.json()["name"] == "Local Name"
    assert response.json()["bio"] == "First thing"
    assert database.users.documents["auth0|new"]["handle"] == "new"


def test_me_assigns_distinct_handles_for_colliding_new_users():
    database = FakeDatabase()
    first = Principal(sub="auth0|one", name="One", email="same@example.com", picture=None)
    second = Principal(sub="auth0|two", name="Two", email="same@example.com", picture=None)

    with TestClient(make_api(database, first)) as client:
        first_response = client.get("/api/me")
    with TestClient(make_api(database, second)) as client:
        second_response = client.get("/api/me")

    assert first_response.json()["handle"] == "same"
    assert second_response.json()["handle"] == "same2"
    assert len({document["handle"] for document in database.users.documents.values()}) == 2


def test_ensure_indexes_keeps_motor_index_contract(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(db_module, "get_db", lambda: database)

    run(db_module.ensure_indexes())

    assert database.items.indexes == [
        ("city", {}),
        ([("title", "text"), ("hood", "text")], {}),
    ]
    assert database.rankings.indexes[0] == ([("sub", 1), ("item_id", 1)], {"unique": True})
    assert database.rank_sessions.indexes == [("created_at", {"expireAfterSeconds": 3600})]
    assert database.users.indexes == [("handle", {"unique": True, "sparse": True})]


def test_lifespan_closes_client_when_startup_fails(monkeypatch):
    events = []

    async def fail_indexes():
        events.append("indexes")
        raise RuntimeError("mongo unavailable")

    async def close():
        events.append("close")

    monkeypatch.setattr(main_module, "ensure_indexes", fail_indexes)
    monkeypatch.setattr(main_module, "close_client", close)

    async def exercise():
        with pytest.raises(RuntimeError, match="mongo unavailable"):
            async with main_module.lifespan(FastAPI()):
                raise AssertionError("startup should not yield")

    run(exercise())
    assert events == ["indexes", "close"]


def test_lifespan_closes_client_when_application_body_fails(monkeypatch):
    events = []

    async def indexes():
        events.append("indexes")

    async def close():
        events.append("close")

    monkeypatch.setattr(main_module, "ensure_indexes", indexes)
    monkeypatch.setattr(main_module, "close_client", close)

    async def exercise():
        with pytest.raises(RuntimeError, match="request failed"):
            async with main_module.lifespan(FastAPI()):
                raise RuntimeError("request failed")

    run(exercise())
    assert events == ["indexes", "close"]


def test_lifespan_closes_mongo_when_auth_validator_close_fails(monkeypatch):
    events = []

    async def indexes():
        events.append("indexes")

    async def close_mongo():
        events.append("mongo")

    class BrokenValidator:
        async def close(self):
            events.append("auth")
            raise RuntimeError("auth close failed")

    monkeypatch.setattr(main_module, "ensure_indexes", indexes)
    monkeypatch.setattr(main_module, "close_client", close_mongo)
    app = FastAPI()
    app.state.auth0_validator = BrokenValidator()

    async def exercise():
        with pytest.raises(RuntimeError, match="auth close failed"):
            async with main_module.lifespan(app):
                pass

    run(exercise())
    assert events == ["indexes", "auth", "mongo"]
