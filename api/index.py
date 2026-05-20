import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


class OrganizeRequest(BaseModel):
    video_id: str
    access_token: str


class PlaylistEntry(BaseModel):
    name: str
    playlist_id: str
    created: bool
    added: bool


class OrganizeResponse(BaseModel):
    video_id: str
    title: str
    metadata: dict
    playlists: list[PlaylistEntry]


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/organize", response_model=OrganizeResponse)
async def organize(body: OrganizeRequest):
    client = YouTubeClient(body.access_token)

    video = await client.get_video(body.video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    meta = parse_description(video.description, video.tags)
    meta.title = video.title

    existing_playlists = await client.get_my_playlists()

    results: list[PlaylistEntry] = []

    for category, value in meta.playlist_entries():
        playlist_name = f"{category}: {value}"
        try:
            pl = await client.ensure_playlist(playlist_name, existing_playlists)
            added = await client.add_video_to_playlist(pl.playlist_id, body.video_id)
            results.append(PlaylistEntry(
                name=playlist_name,
                playlist_id=pl.playlist_id,
                created=pl.created,
                added=added,
            ))
        except httpx.HTTPStatusError as e:
            results.append(PlaylistEntry(
                name=playlist_name,
                playlist_id="",
                created=False,
                added=False,
            ))

    return OrganizeResponse(
        video_id=body.video_id,
        title=video.title,
        metadata={
            "singers": meta.singers,
            "music_director": meta.music_director,
            "lyricist": meta.lyricist,
            "film": meta.film,
            "language": meta.language,
            "year": meta.year,
        },
        playlists=results,
    )
