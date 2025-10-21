# Nanosheet

A minimal collaborative micro-sheet built with Yjs, Svelte, FastAPI, and Google Cloud.

## Features

- **Real-time collaboration** via Yjs WebSocket sync
- **Persistent state** with GCS snapshots (auto-save on changes)
- **Card metadata** stored in Firestore (Datastore mode)
- **Drag & drop** cards between cells
- **Row/column operations**: add, copy
- **Auto-collapse** empty rows
- Simple grid UI with no gridlines

## Architecture

### Frontend
- **Svelte 5** with TypeScript
- **Yjs** for CRDT-based state
- **y-websocket** for WebSocket provider

### Backend
- **FastAPI** + **Uvicorn**
- **ypy-websocket** for Yjs relay
- **Google Cloud Storage** for Yjs snapshots
- **Google Cloud Datastore** for card metadata

### Data Model

**Yjs document** (per `sheetId`):
- `rowOrder`: Y.Array<string> — ordered row IDs
- `colOrder`: Y.Array<string> — ordered column IDs (default: `c-media`, `c-alt`, `c-notes`)
- `cells`: Y.Map — key = `${rowId}:${colId}`, value = `{ cardId: string }`

**Card entity** (Datastore Kind: `Card`):
```json
{
  "cardId": "ULID",
  "title": "Red",
  "color": "#FF6B6B",
  "createdAt": "ISO-8601"
}
```

## Setup

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Google Cloud Project** with:
  - Cloud Storage bucket
  - Datastore enabled (Datastore mode)
  - Service account credentials JSON

### Environment Variables

The `.env` file in the project root is already configured:

```bash
# Backend
YJS_GCS_BUCKET=magicpiles-media
GOOGLE_APPLICATION_CREDENTIALS=/Users/scottpenberthy/work/es/nanosheet/gcp-service-account-key.json
PORT=8000

# Frontend
VITE_YWS=ws://localhost:8000/yjs
VITE_API_URL=http://localhost:8000
```

The backend automatically loads this file using `python-dotenv`.

### GCP Setup

First, ensure your Google Cloud project has the correct APIs enabled and permissions configured:

```bash
./setup-gcp.sh
```

This script will:
- Enable required APIs (Cloud Storage, Datastore, Firestore)
- Create Datastore database if needed (in Datastore mode)
- Grant necessary IAM permissions to your service account
  - `roles/storage.admin` - for GCS bucket access
  - `roles/datastore.user` - for Datastore read/write
- Verify the GCS bucket exists (creates it if needed)
- Test permissions to ensure everything works

**Note**: You need `gcloud` CLI installed and authenticated to run this script.

### Installation

#### Backend

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

#### Frontend

```bash
cd frontend
npm install
```

## Running

### Start Backend

```bash
# Activate venv if not already
source venv/bin/activate

# Start server
uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be available at `http://localhost:8000`

API endpoints:
- `GET /` — Health check with bucket info
- `POST /api/cards` — Create new card
- `GET /api/cards?ids=...` — Batch fetch cards
- `WS /yjs/{sheetId}` — Yjs WebSocket sync

### Start Frontend

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

1. Open `http://localhost:5173` in two browser tabs
2. On first load, a demo 5×5 grid is seeded with colored cards in the first 3 columns
3. Both tabs should see the same state (real-time sync)

### Actions

- **Add Card** — Creates new card and adds row with card in first column
- **Add Row** — Adds empty row
- **Add Column** — Adds empty column
- **Drag & Drop** — Drag cards between cells; source row collapses if empty
- **Delete Card** (×) — Removes card; row collapses if empty
- **Copy Row/Column** — Duplicates all cells in row/column

### Testing Collaboration

1. Open two tabs at `http://localhost:5173`
2. Add a card in one tab → should appear in both
3. Drag a card in one tab → should move in both
4. Delete a card in one tab → should disappear in both

### Testing Persistence

1. Make some changes (add/move cards)
2. Stop the backend (`Ctrl+C`)
3. Restart the backend
4. Refresh the frontend → state should restore from GCS snapshot

## Project Structure

```
nanosheet/
├── backend/
│   ├── server.py           # FastAPI app with ypy-websocket
│   ├── cards_api.py        # Cards CRUD endpoints
│   ├── gcs_snapshots.py    # GCS snapshot load/save
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   └── ySheet.ts   # Yjs sheet helpers
│   │   ├── routes/
│   │   │   └── +page.svelte # Main grid UI
│   │   └── main.js         # App entry
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .env                    # Environment variables (create this)
├── .gitignore
└── README.md
```

## Color Palette

- `#6BCB77` (Green)
- `#FFD93D` (Gold)
- `#FF6B6B` (Red)
- `#4D96FF` (Blue)
- `#845EC2` (Purple)

## Acceptance Checklist

- [ ] Open two tabs at same sheetId → see seeded colored cards in first 3 columns
- [ ] Add Card → new row appears in both tabs
- [ ] Drag a card to another cell → both tabs update; empty source row collapses
- [ ] Copy Row/Column → duplicates show in both tabs
- [ ] Restart backend → state restores from GCS snapshot

## Development Notes

- **Debounced snapshots**: GCS saves triggered 800ms after last change
- **Room lifecycle**: Snapshot loaded on first client connect
- **Card IDs**: Generated using ULID for time-sortable uniqueness
- **No auth**: This is a demo/MVP — add auth for production use
- **Single server**: No horizontal scaling yet — for multi-server, use Redis for ypy-websocket

## Troubleshooting

**GCS errors**: Check that `GOOGLE_APPLICATION_CREDENTIALS` points to valid service account JSON with Storage Admin permissions

**Datastore errors**: Ensure Datastore is enabled in Datastore mode (not Firestore Native mode)

**WebSocket connection fails**: Check that `VITE_YWS` matches backend WebSocket URL

**State not syncing**: Open browser console to check for WebSocket errors; ensure both tabs connect to same `sheetId`

## License

MIT
