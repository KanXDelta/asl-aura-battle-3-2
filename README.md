# ASL Aura Battle — Local MVP

A local, turn-based PvP American Sign Language learning game. Two players see
each other's live webcam feed over WebRTC, MediaPipe tracks hands, face, and
upper-body pose in the browser, and a 20-second recording window per round
feeds a landmark-based grader. After 3 rounds, total Aura Points decide the
winner.

## Folder Structure

```
asl-aura-battle/
├── server/
│   ├── package.json
│   └── server.js
└── client/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── public/                    <- put the 3 .task model files here
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── BattleScreen.jsx
        ├── useBodyTracking.js
        ├── usePeerVideo.js
        ├── gestureScoring.js
        └── index.css
```

## One-Time Setup

1. Install Node 18+.
2. Download all three MediaPipe model files into `client/public/`:
   - `hand_landmarker.task` — https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
   - `face_landmarker.task` — https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
   - `pose_landmarker_lite.task` — https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
3. `cd server && npm install`
4. `cd client && npm install`

## Running Locally

**Terminal 1:** `cd server && npm start` → `http://localhost:4000`
(If `EADDRINUSE`: `lsof -i :4000` then `kill -9 <PID>`, or `PORT=4001 npm start`.)

**Terminal 2:** `cd client && npm run dev` → open the printed URL in two tabs.

## Fixed in This Version: Opponent Video Never Connecting

A real bug was found and fixed: the room creator's WebRTC connection used to
start the instant THEIR OWN webcam was ready, which happens immediately after
`create_room` — before the second player has joined. The very first
connection offer was silently dropped server-side (there was no one to relay
it to yet), permanently breaking the video handshake even after the second
player arrived moments later.

Fixed by:
1. Gating WebRTC connection start on `bothPlayersPresent` (both players
   confirmed in the room), not just "my own camera is ready."
2. Buffering any inbound signal that arrives before the local connection
   object exists yet, and flushing it once ready — a defensive fix for any
   remaining timing race between the two browsers.

## Game Flow

1. Player A clicks **Create Room**, shares the 4-letter code.
2. Player B clicks **Join Room**. Both live video feeds should now connect
   to each other via WebRTC.
3. Both click **I'm Ready!**.
4. Each round opens with a "Ready • Set • Go!" beat.
5. A 20-second timer AND a landmark recording start simultaneously. A
   pulsing red dot + progress bar show recording is live.
6. Click **Submit Sign** to stop your recording early and send it for
   grading, or let the 20s run out (auto-submits whatever was recorded).
7. The round ends on both-submitted OR timeout, whichever comes first.
8. After 3 rounds, total Aura Points decide the winner (ties broken by speed).

## How Grading Works (Honest Caveat)

`gestureScoring.js` grades the recorded sequence using presence ratio (was
your hand actually visible) and motion energy (did it move appropriately for
the prompt) — NOT a trained sign-classification model, which needs labeled
ASL data out of scope for a hackathon MVP. Populate `REFERENCE_SEQUENCES`
with your own captured correct signs to switch to real DTW-based comparison
via the included `dtwDistance()` function.

## Playing Across Two Machines (Same Wi-Fi)

1. Find your LAN IP: `ipconfig getifaddr en0` (Mac).
2. In `client/src/App.jsx`, change `SOCKET_URL` to `"http://<YOUR_IP>:4000"`.
   Restart the frontend.
3. Friend visits `http://<YOUR_IP>:5173` (not `localhost`).
4. Webcam AND WebRTC over LAN need HTTPS or the Chrome insecure-origin flag
   (`chrome://flags/#unsafely-treat-insecure-origin-as-secure`).
5. Same Wi-Fi, AP isolation off. Phone hotspot as fallback.
6. If video still won't connect across two separate networks, only STUN is
   configured (no TURN) — strict NAT/corporate Wi-Fi may block direct P2P
   entirely. Ask if you want a TURN provider wired in.

## Known MVP Shortcuts

- Grading is a landmark heuristic, not a trained classifier.
- Client-computed accuracy is trusted by the server as-is.
- Loading 3 MediaPipe models is heavier than 1 — expect a longer load time.
- Face and pose landmarks are tracked/drawn but not yet factored into the
  grading score (hand-only for now).

## Socket.io Event Reference

| Event | Direction | Payload |
|---|---|---|
| `create_room` | client → server | `{ name }` → callback `{ success, roomCode }` |
| `join_room` | client → server | `{ roomCode, name }` → callback `{ success, roomCode?, error? }` |
| `player_ready` | client → server | `{ roomCode }` |
| `submit_sign` | client → server | `{ roomCode, accuracy }` |
| `webrtc_signal` | both directions | `{ roomCode, signal }` (relayed, never stored) |
| `game_state_update` | server → client | `{ code, players: [{id,name,score,ready}], round, totalRounds, prompt, status }` |
| `round_countdown` | server → client | `{ round, prompt }` |
| `round_start` | server → client | `{ round, prompt, durationMs }` (20000) |
| `round_result` | server → client | `{ round, results: [{ id, name, roundAccuracy, totalScore }] }` |
| `game_over` | server → client | `{ winnerId, forfeit?, finalScores }` |
| `opponent_left` | server → client | `{ id }` |

`status`: `"waiting"` → `"ready_check"` → `"in_progress"` → `"finished"`.

## Troubleshooting

- **"vite: command not found" / "Cannot find module 'express'"** — run
  `npm install` in the respective folder.
- **`EADDRINUSE` on port 4000** — see above.
- **Friend can't connect with your room code** — they're on `localhost`
  instead of your LAN IP.
- **No hand/face/pose overlay** — confirm all three `.task` files are in
  `client/public/`, check console for 404s.
- **Opponent's video never connects** — should be fixed in this version; if
  it still fails across two networks, you likely need a TURN server.
- **SharedArrayBuffer / WASM errors** — confirm COOP/COEP headers in
  `vite.config.js`, hard-refresh after any config change.
