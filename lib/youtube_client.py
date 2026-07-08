import asyncio
import httpx
from dataclasses import dataclass


YT_API_BASE = "https://www.googleapis.com/youtube/v3"


async def _post_with_404_retry(
    client: httpx.AsyncClient, url: str, headers: dict, params: dict, json: dict, attempts: int = 3
) -> httpx.Response:
    """POST with retries on 404: used right after creating a resource that
    can take a moment to propagate through YouTube's backend, so acting on
    it immediately sometimes 404s transiently."""
    for attempt in range(attempts):
        resp = await client.post(url, headers=headers, params=params, json=json)
        if resp.status_code == 404 and attempt < attempts - 1:
            await asyncio.sleep(0.5 * (attempt + 1))
            continue
        resp.raise_for_status()
        return resp


@dataclass
class VideoInfo:
    video_id: str
    title: str
    description: str
    tags: list[str]
    channel_title: str


@dataclass
class PlaylistResult:
    playlist_id: str
    name: str
    created: bool


class YouTubeClient:
    def __init__(self, access_token: str):
        self._headers = {"Authorization": f"Bearer {access_token}"}

    async def get_video(self, video_id: str) -> VideoInfo | None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{YT_API_BASE}/videos",
                headers=self._headers,
                params={
                    "id": video_id,
                    "part": "snippet,topicDetails",
                    "maxResults": 1,
                },
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])
            if not items:
                return None
            snippet = items[0]["snippet"]
            return VideoInfo(
                video_id=video_id,
                title=snippet.get("title", ""),
                description=snippet.get("description", ""),
                tags=snippet.get("tags", []),
                channel_title=snippet.get("channelTitle", ""),
            )

    async def get_my_playlists(self) -> dict[str, str]:
        """Return {playlist_title: playlist_id} for all user playlists."""
        playlists: dict[str, str] = {}
        page_token: str | None = None

        async with httpx.AsyncClient() as client:
            while True:
                params: dict = {
                    "part": "snippet",
                    "mine": "true",
                    "maxResults": 50,
                }
                if page_token:
                    params["pageToken"] = page_token

                resp = await client.get(
                    f"{YT_API_BASE}/playlists",
                    headers=self._headers,
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

                for item in data.get("items", []):
                    title = item["snippet"]["title"]
                    playlists[title] = item["id"]

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

        return playlists

    async def create_playlist(self, title: str, description: str = "") -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{YT_API_BASE}/playlists",
                headers={**self._headers, "Content-Type": "application/json"},
                params={"part": "snippet,status"},
                json={
                    "snippet": {"title": title, "description": description},
                    "status": {"privacyStatus": "private"},
                },
            )
            resp.raise_for_status()
            return resp.json()["id"]

    async def get_playlist_video_ids(self, playlist_id: str) -> set[str]:
        """Return the set of video IDs already in a playlist (YouTube allows duplicate
        inserts silently, so callers must check this themselves before adding)."""
        video_ids: set[str] = set()
        page_token: str | None = None

        async with httpx.AsyncClient() as client:
            while True:
                params: dict = {
                    "part": "contentDetails",
                    "playlistId": playlist_id,
                    "maxResults": 50,
                    "fields": "items(contentDetails/videoId),nextPageToken",
                }
                if page_token:
                    params["pageToken"] = page_token

                resp = await client.get(
                    f"{YT_API_BASE}/playlistItems",
                    headers=self._headers,
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

                for item in data.get("items", []):
                    vid = item.get("contentDetails", {}).get("videoId")
                    if vid:
                        video_ids.add(vid)

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

        return video_ids

    async def add_video_to_playlist(self, playlist_id: str, video_id: str) -> bool:
        """Add video to playlist. Caller is responsible for checking
        get_playlist_video_ids first, the API inserts duplicates silently."""
        async with httpx.AsyncClient() as client:
            await _post_with_404_retry(
                client,
                f"{YT_API_BASE}/playlistItems",
                headers={**self._headers, "Content-Type": "application/json"},
                params={"part": "snippet"},
                json={
                    "snippet": {
                        "playlistId": playlist_id,
                        "resourceId": {
                            "kind": "youtube#video",
                            "videoId": video_id,
                        },
                    }
                },
            )
            return True

    async def ensure_playlist(
        self, title: str, existing: dict[str, str]
    ) -> PlaylistResult:
        """Get or create playlist by title. Mutates `existing` on create."""
        if title in existing:
            return PlaylistResult(playlist_id=existing[title], name=title, created=False)

        playlist_id = await self.create_playlist(title)
        existing[title] = playlist_id
        return PlaylistResult(playlist_id=playlist_id, name=title, created=True)
