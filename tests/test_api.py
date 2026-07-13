import httpx
import pytest
from fastapi.testclient import TestClient

from api.index import app
import api.index as api_index
from lib.youtube_client import PlaylistResult, VideoInfo


@pytest.fixture
def client():
    return TestClient(app)


def _error_response(status_code):
    request = httpx.Request("GET", "https://example.test")
    response = httpx.Response(status_code, request=request, json={})
    return httpx.HTTPStatusError("error", request=request, response=response)


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_preview_returns_404_when_video_missing(client, monkeypatch):
    async def get_video(self, video_id):
        return None

    monkeypatch.setattr(api_index.YouTubeClient, "get_video", get_video)

    resp = client.post("/api/preview", json={"video_id": "missing", "access_token": "tok"})

    assert resp.status_code == 404


def test_preview_flags_already_added_video(client, monkeypatch):
    async def get_video(self, video_id):
        return VideoInfo(
            video_id=video_id, title="Kesariya",
            description="Singer: Arijit Singh", tags=[], channel_title="T-Series",
        )

    async def get_my_playlists(self):
        return {"Singer: Arijit Singh": "playlist-1"}

    async def get_playlist_video_ids(self, playlist_id):
        return {"missing"}

    monkeypatch.setattr(api_index.YouTubeClient, "get_video", get_video)
    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)
    monkeypatch.setattr(api_index.YouTubeClient, "get_playlist_video_ids", get_playlist_video_ids)

    resp = client.post("/api/preview", json={"video_id": "missing", "access_token": "tok"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["entries"] == [{"category": "Singer", "value": "Arijit Singh", "already_added": True}]


def test_preview_survives_playlist_lookup_failure(client, monkeypatch):
    async def get_video(self, video_id):
        return VideoInfo(
            video_id=video_id, title="Kesariya",
            description="Singer: Arijit Singh", tags=[], channel_title="T-Series",
        )

    async def get_my_playlists(self):
        raise _error_response(401)

    monkeypatch.setattr(api_index.YouTubeClient, "get_video", get_video)
    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)

    resp = client.post("/api/preview", json={"video_id": "v1", "access_token": "tok"})

    assert resp.status_code == 200
    assert resp.json()["entries"][0]["already_added"] is False


def test_organize_rejects_empty_entries(client):
    resp = client.post("/api/organize", json={
        "video_id": "v1", "access_token": "tok", "entries": [{"category": "", "value": ""}],
    })
    assert resp.status_code == 400


def test_organize_returns_friendly_error_when_no_youtube_channel(client, monkeypatch):
    async def get_my_playlists(self):
        raise _error_response(404)

    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)

    resp = client.post("/api/organize", json={
        "video_id": "v1", "access_token": "tok",
        "entries": [{"category": "Singer", "value": "Arijit Singh"}],
    })

    assert resp.status_code == 400
    assert "YouTube channel" in resp.json()["detail"]


def test_organize_returns_502_on_other_youtube_errors(client, monkeypatch):
    async def get_my_playlists(self):
        raise _error_response(500)

    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)

    resp = client.post("/api/organize", json={
        "video_id": "v1", "access_token": "tok",
        "entries": [{"category": "Singer", "value": "Arijit Singh"}],
    })

    assert resp.status_code == 502


def test_organize_creates_playlist_and_adds_video(client, monkeypatch):
    async def get_my_playlists(self):
        return {}

    async def ensure_playlist(self, title, existing):
        existing[title] = "new-playlist-id"
        return PlaylistResult(playlist_id="new-playlist-id", name=title, created=True)

    async def add_video_to_playlist(self, playlist_id, video_id):
        return True

    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)
    monkeypatch.setattr(api_index.YouTubeClient, "ensure_playlist", ensure_playlist)
    monkeypatch.setattr(api_index.YouTubeClient, "add_video_to_playlist", add_video_to_playlist)

    resp = client.post("/api/organize", json={
        "video_id": "v1", "access_token": "tok", "title": "Kesariya",
        "entries": [{"category": "Singer", "value": "Arijit Singh"}],
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["playlists"] == [{
        "name": "Singer: Arijit Singh", "playlist_id": "new-playlist-id",
        "created": True, "added": True,
    }]


def test_organize_skips_add_when_video_already_in_existing_playlist(client, monkeypatch):
    async def get_my_playlists(self):
        return {"Singer: Arijit Singh": "existing-id"}

    async def ensure_playlist(self, title, existing):
        return PlaylistResult(playlist_id=existing[title], name=title, created=False)

    async def get_playlist_video_ids(self, playlist_id):
        return {"v1"}

    async def add_video_to_playlist(self, playlist_id, video_id):
        raise AssertionError("should not be called when video already present")

    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)
    monkeypatch.setattr(api_index.YouTubeClient, "ensure_playlist", ensure_playlist)
    monkeypatch.setattr(api_index.YouTubeClient, "get_playlist_video_ids", get_playlist_video_ids)
    monkeypatch.setattr(api_index.YouTubeClient, "add_video_to_playlist", add_video_to_playlist)

    resp = client.post("/api/organize", json={
        "video_id": "v1", "access_token": "tok",
        "entries": [{"category": "Singer", "value": "Arijit Singh"}],
    })

    assert resp.status_code == 200
    data = resp.json()["playlists"][0]
    assert data["created"] is False
    assert data["added"] is False


def test_organize_continues_after_one_entry_fails(client, monkeypatch):
    async def get_my_playlists(self):
        return {}

    async def ensure_playlist(self, title, existing):
        if "Singer" in title:
            raise _error_response(500)
        existing[title] = "playlist-ok"
        return PlaylistResult(playlist_id="playlist-ok", name=title, created=True)

    async def add_video_to_playlist(self, playlist_id, video_id):
        return True

    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)
    monkeypatch.setattr(api_index.YouTubeClient, "ensure_playlist", ensure_playlist)
    monkeypatch.setattr(api_index.YouTubeClient, "add_video_to_playlist", add_video_to_playlist)

    resp = client.post("/api/organize", json={
        "video_id": "v1", "access_token": "tok",
        "entries": [
            {"category": "Singer", "value": "Arijit Singh"},
            {"category": "Movie", "value": "Pathaan"},
        ],
    })

    assert resp.status_code == 200
    results = {r["name"]: r for r in resp.json()["playlists"]}
    assert results["Singer: Arijit Singh"]["created"] is False
    assert results["Singer: Arijit Singh"]["added"] is False
    assert results["Movie: Pathaan"]["created"] is True
    assert results["Movie: Pathaan"]["added"] is True


def test_organize_reports_add_failure_on_network_error_instead_of_500(client, monkeypatch):
    """A newly created playlist can be flaky to write to right away (timeout,
    connection reset), not just 404. That must land as added=False for that
    entry, not blow up the whole request and lose every other entry's result."""
    async def get_my_playlists(self):
        return {}

    async def ensure_playlist(self, title, existing):
        existing[title] = "new-playlist-id"
        return PlaylistResult(playlist_id="new-playlist-id", name=title, created=True)

    async def add_video_to_playlist(self, playlist_id, video_id):
        raise httpx.ConnectTimeout("connection timed out")

    monkeypatch.setattr(api_index.YouTubeClient, "get_my_playlists", get_my_playlists)
    monkeypatch.setattr(api_index.YouTubeClient, "ensure_playlist", ensure_playlist)
    monkeypatch.setattr(api_index.YouTubeClient, "add_video_to_playlist", add_video_to_playlist)

    resp = client.post("/api/organize", json={
        "video_id": "v1", "access_token": "tok", "title": "Kesariya",
        "entries": [{"category": "Singer", "value": "Arijit Singh"}],
    })

    assert resp.status_code == 200
    data = resp.json()["playlists"][0]
    assert data["created"] is True
    assert data["added"] is False
