# Red Shift Protocol — Phase 2

Phase 2 adds an **authoritative multiplayer-ready game server** and converts the browser app to a network client.

## What changed in Phase 2

- Added `server.js` (Node HTTP server) with authoritative game simulation tick.
- Added API endpoints:
  - `POST /api/join`
  - `GET /api/state?playerId=...`
  - `POST /api/action`
- Converted `main.js` to a server-driven client that polls state and submits actions.
- Supports multiple browser clients connected to one shared match state.
- Keeps major gameplay mechanics from phase 1:
  - impostor + infection
  - bloodlust + forced kill at zero
  - acid-vat ejection
  - compact 3-level map and room actions
  - economy + 2-hand inventory
  - hunger/radiation/bleeding
  - 3 roaming mutants
  - chat and floating local bubbles
  - personnel files and event logs

## Run

```bash
node server.js
```

Then open:

- `http://localhost:8080`

Open the URL in multiple tabs/windows to simulate multiple players.
