import httpx
import pytest
import respx

from lib.youtube_client import YT_API_BASE, YouTubeClient

TOKEN = "fake-token"


@pytest.fixture
def client():
    return YouTubeClient(TOKEN)


@respx.mock
async def test_get_video_returns_video_info(client):
    respx.get(f"{YT_API_BASE}/videos").mock(
        return_value=httpx.Response(200, json={
            "items": [{
                "snippet": {
                    "title": "Kesariya",
                    "description": "Singer: Arijit Singh",
                    "tags": ["Bollywood"],
                    "channelTitle": "T-Series",
                }
            }]
        })
    )

    video = await client.get_video("abc123")

    assert video.video_id == "abc123"
    assert video.title == "Kesariya"
    assert video.description == "Singer: Arijit Singh"
    assert video.tags == ["Bollywood"]
    assert video.channel_title == "T-Series"


@respx.mock
async def test_get_video_returns_none_when_not_found(client):
    respx.get(f"{YT_API_BASE}/videos").mock(return_value=httpx.Response(200, json={"items": []}))

    video = await client.get_video("missing")

    assert video is None


@respx.mock
async def test_get_video_raises_on_http_error(client):
    respx.get(f"{YT_API_BASE}/videos").mock(return_value=httpx.Response(401, json={}))

    with pytest.raises(httpx.HTTPStatusError):
        await client.get_video("abc123")


@respx.mock
async def test_get_my_playlists_follows_pagination(client):
    route = respx.get(f"{YT_API_BASE}/playlists")
    route.side_effect = [
        httpx.Response(200, json={
            "items": [{"id": "p1", "snippet": {"title": "Singer: Arijit Singh"}}],
            "nextPageToken": "page2",
        }),
        httpx.Response(200, json={
            "items": [{"id": "p2", "snippet": {"title": "Singer: Shreya Ghoshal"}}],
        }),
    ]

    playlists = await client.get_my_playlists()

    assert playlists == {
        "Singer: Arijit Singh": "p1",
        "Singer: Shreya Ghoshal": "p2",
    }
    assert route.call_count == 2


@respx.mock
async def test_create_playlist_returns_id(client):
    respx.post(f"{YT_API_BASE}/playlists").mock(
        return_value=httpx.Response(200, json={"id": "new-playlist-id"})
    )

    playlist_id = await client.create_playlist("Singer: Arijit Singh")

    assert playlist_id == "new-playlist-id"


@respx.mock
async def test_get_playlist_video_ids_dedupes_and_paginates(client):
    route = respx.get(f"{YT_API_BASE}/playlistItems")
    route.side_effect = [
        httpx.Response(200, json={
            "items": [
                {"contentDetails": {"videoId": "v1"}},
                {"contentDetails": {"videoId": "v2"}},
            ],
            "nextPageToken": "page2",
        }),
        httpx.Response(200, json={
            "items": [{"contentDetails": {"videoId": "v1"}}],
        }),
    ]

    video_ids = await client.get_playlist_video_ids("playlist-1")

    assert video_ids == {"v1", "v2"}


@respx.mock
async def test_add_video_to_playlist_retries_on_transient_404(client, monkeypatch):
    monkeypatch.setattr("lib.youtube_client.asyncio.sleep", _no_sleep)

    route = respx.post(f"{YT_API_BASE}/playlistItems")
    route.side_effect = [
        httpx.Response(404, json={}),
        httpx.Response(200, json={"id": "item-1"}),
    ]

    result = await client.add_video_to_playlist("playlist-1", "video-1")

    assert result is True
    assert route.call_count == 2


@respx.mock
async def test_add_video_to_playlist_raises_after_exhausting_404_retries(client, monkeypatch):
    monkeypatch.setattr("lib.youtube_client.asyncio.sleep", _no_sleep)

    respx.post(f"{YT_API_BASE}/playlistItems").mock(return_value=httpx.Response(404, json={}))

    with pytest.raises(httpx.HTTPStatusError):
        await client.add_video_to_playlist("playlist-1", "video-1")


@respx.mock
async def test_add_video_to_playlist_raises_immediately_on_non_404_error(client):
    respx.post(f"{YT_API_BASE}/playlistItems").mock(return_value=httpx.Response(403, json={}))

    with pytest.raises(httpx.HTTPStatusError):
        await client.add_video_to_playlist("playlist-1", "video-1")


async def test_ensure_playlist_returns_existing_without_creating(client):
    existing = {"Singer: Arijit Singh": "existing-id"}

    result = await client.ensure_playlist("Singer: Arijit Singh", existing)

    assert result.playlist_id == "existing-id"
    assert result.created is False


@respx.mock
async def test_ensure_playlist_creates_and_mutates_existing_dict(client):
    respx.post(f"{YT_API_BASE}/playlists").mock(
        return_value=httpx.Response(200, json={"id": "brand-new-id"})
    )
    existing: dict[str, str] = {}

    result = await client.ensure_playlist("Singer: New Artist", existing)

    assert result.playlist_id == "brand-new-id"
    assert result.created is True
    assert existing["Singer: New Artist"] == "brand-new-id"


async def _no_sleep(*args, **kwargs):
    return None
