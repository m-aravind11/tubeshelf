import httpx
from dataclasses import dataclass


YT_API_BASE = "https://www.googleapis.com/youtube/v3"


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

    async def add_video_to_playlist(self, playlist_id: str, video_id: str) -> bool:
        """Add video. Returns False if already present (409), raises on other errors."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
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
            if resp.status_code == 409:
                return False
            resp.raise_for_status()
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
