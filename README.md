# TubeShelf

Chrome extension that auto-organizes YouTube / YouTube Music songs into
playlists (Singer, Music Director, Film, Lyricist, Language) parsed from the
video's own description. A "Shelf It" button on the watch page previews the
parsed tags, lets you edit them, then creates/updates the playlists on
confirm.

- `extension/` — Chrome MV3 extension (content script, background worker, popup)
- `api/` — FastAPI backend (parses metadata, talks to the YouTube Data API v3)
- `lib/` — shared backend logic (description parser, YouTube API client)

## Backend

### Install

Requires Python 3.10+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run locally

```bash
uvicorn api.index:app --reload --port 8000
```

Health check: `curl http://localhost:8000/api/health`

The backend is stateless — no database, no `.env` required to run it. It
only needs the OAuth access token the extension sends with each request.

### Deploy

Deployed on Vercel; `vercel.json` rewrites `/api/*` to `api/index.py`. Pushing
to `master` auto-deploys (see `vercel.json`). To deploy manually:

```bash
vercel deploy --prod
```

## Extension

### Load it unpacked

1. Go to `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked**, select the `extension/` folder.
3. Open a YouTube or YouTube Music song page — a "Shelf It" button appears
   near the bottom of the page.
4. Click the extension icon and sign in with Google to grant the
   `youtube` OAuth scope (needed to read video metadata and manage playlists).

### Point it at a local backend

`extension/background.js` hardcodes the API base URL:

```js
const API_BASE = "https://tubeshelf-psi.vercel.app";
```

For local testing against `uvicorn` on port 8000, change this to
`http://localhost:8000`, then reload the extension from `chrome://extensions`.
Revert before shipping/reloading against production.

### Using it

Click **Shelf It** on a song page → a modal shows the parsed tags (editable
category + value rows, remove or add entries) → **Shelve It** creates/updates
the corresponding playlists and adds the video, skipping playlists that
already contain it.
