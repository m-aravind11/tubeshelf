import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx

from lib.metadata_parser import parse_description
from lib.youtube_client import YouTubeClient

app = FastAPI(title="TubeShelf API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.youtube.com",
        "chrome-extension://*",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# Vercel serves everything under assets/ as static files directly in
# production; this mount exists only so `uvicorn --reload` matches that
# behavior for local development.
app.mount(
    "/assets",
    StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "assets")),
    name="assets",
)


class PlaylistEntryIn(BaseModel):
    category: str
    value: str


class OrganizeRequest(BaseModel):
    video_id: str
    access_token: str
    title: str = ""
    entries: list[PlaylistEntryIn]


class PreviewRequest(BaseModel):
    video_id: str
    access_token: str


class PlaylistEntry(BaseModel):
    name: str
    playlist_id: str
    created: bool
    added: bool


class PreviewEntry(BaseModel):
    category: str
    value: str
    already_added: bool = False


class PreviewResponse(BaseModel):
    video_id: str
    title: str
    entries: list[PreviewEntry]


class OrganizeResponse(BaseModel):
    video_id: str
    title: str
    playlists: list[PlaylistEntry]


@app.get("/api/health")
async def health():
    return {"status": "ok"}


_PRIVACY_POLICY_PATH = os.path.join(os.path.dirname(__file__), "..", "privacy.html")
_LANDING_PAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "index.html")


@app.get("/privacy.html", response_class=HTMLResponse)
async def privacy_policy():
    with open(_PRIVACY_POLICY_PATH, encoding="utf-8") as f:
        return f.read()


@app.get("/", response_class=HTMLResponse)
async def landing_page():
    with open(_LANDING_PAGE_PATH, encoding="utf-8") as f:
        return f.read()


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(os.path.join(os.path.dirname(__file__), "..", "assets", "favicon.ico"))


@app.post("/api/preview", response_model=PreviewResponse)
async def preview(body: PreviewRequest):
    """Parse a video's metadata into proposed playlist entries, without creating
    or modifying anything, the user confirms/edits these before /api/organize."""
    client = YouTubeClient(body.access_token)

    video = await client.get_video(body.video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    meta = parse_description(video.description, video.tags)
    raw_entries = meta.playlist_entries()

    # Check whether the video is already sitting in the matching playlist for
    # any of these entries, so the user gets a heads-up before re-adding it.
    existing_playlists: dict[str, str] = {}
    if raw_entries:
        try:
            existing_playlists = await client.get_my_playlists()
        except httpx.HTTPStatusError:
            pass  # non-fatal, preview still works, just without the heads-up

    entries: list[PreviewEntry] = []
    for category, value in raw_entries:
        playlist_name = f"{category}: {value}"
        already_added = False
        playlist_id = existing_playlists.get(playlist_name)
        if playlist_id:
            try:
                video_ids = await client.get_playlist_video_ids(playlist_id)
                already_added = body.video_id in video_ids
            except httpx.HTTPStatusError:
                pass
        entries.append(PreviewEntry(category=category, value=value, already_added=already_added))

    return PreviewResponse(
        video_id=body.video_id,
        title=video.title,
        entries=entries,
    )


@app.post("/api/organize", response_model=OrganizeResponse)
async def organize(body: OrganizeRequest):
    """Create/update playlists for the user-confirmed entries from /api/preview."""
    entries = [e for e in body.entries if e.category.strip() and e.value.strip()]
    if not entries:
        raise HTTPException(status_code=400, detail="No playlist entries provided")

    client = YouTubeClient(body.access_token)

    try:
        existing_playlists = await client.get_my_playlists()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=400,
                detail="Your Google account has no YouTube channel. Visit youtube.com to create one first.",
            )
        raise HTTPException(status_code=502, detail=f"YouTube API error: {e.response.status_code}")

    results: list[PlaylistEntry] = []

    for entry in entries:
        playlist_name = f"{entry.category.strip()}: {entry.value.strip()}"
        try:
            pl = await client.ensure_playlist(playlist_name, existing_playlists)
        except httpx.HTTPStatusError:
            results.append(PlaylistEntry(
                name=playlist_name,
                playlist_id="",
                created=False,
                added=False,
            ))
            continue

        try:
            already_present = False
            if not pl.created:
                existing_video_ids = await client.get_playlist_video_ids(pl.playlist_id)
                already_present = body.video_id in existing_video_ids

            added = False if already_present else await client.add_video_to_playlist(pl.playlist_id, body.video_id)
        except httpx.HTTPStatusError:
            added = False

        results.append(PlaylistEntry(
            name=playlist_name,
            playlist_id=pl.playlist_id,
            created=pl.created,
            added=added,
        ))

    return OrganizeResponse(
        video_id=body.video_id,
        title=body.title,
        playlists=results,
    )
