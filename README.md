# ASL Aura Battle

A local, real-time PvP American Sign Language learning game. Two players face off over live video, MediaPipe tracks hands, face, and upper-body pose directly in the browser, and a landmark-based grader scores each sign attempt. Includes a solo **Learn** mode for practicing individual signs at your own pace.

**Stack:** React + Vite + Tailwind (frontend) · Node + Express + Socket.io (backend) · MediaPipe Tasks Vision (hand/face/pose tracking) · WebRTC via `simple-peer` (peer video)

---

## Quick Start

```bash
# 1. Install dependencies
cd server && npm install
cd ../client && npm install

# 2. Download the 3 required MediaPipe model files into client/public/
#    (see "Model Files" section below for links)

# 3. Run the backend (terminal 1)
cd server && npm start        # → http://localhost:4000

# 4. Run the frontend (terminal 2)
cd client && npm run dev      # → http://localhost:5173
```

Open the printed URL in two browser tabs to test both sides of a match locally before playing with someone else over LAN.

---

## Features

- **Battle mode** — two players, 3 timed rounds, live opponent video via WebRTC, Aura Points scoring, rematch/end-game flow.
- **Learn mode** — practice individual signs against reference images with live hand/face/pose tracking and a pass/fail grader.
- **In-browser tracking** — hands, face mesh, and upper-body pose via MediaPipe, no server-side ML inference required.
- **Zero external services** — all game state lives in server memory; no database, no cloud dependency.

---

## Project Structure

```
asl-aura-battle/
├── server/
│   ├── package.json
│   └── server.js              # Express + Socket.io game server
└── client/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── public/                # ← MediaPipe model files + lesson images go here
    └── src/
        ├── main.jsx
        ├── App.jsx             # Lobby, tab switcher, room create/join
        ├── BattleScreen.jsx    # Main PvP battle UI
        ├── LearnTab.jsx        # Solo practice mode
        ├── useBodyTracking.js  # Hand/face/pose tracking + recording buffer
        ├── usePeerVideo.js     # WebRTC video, signaled over Socket.io
        ├── gestureScoring.js   # Grading logic (Battle + Learn)
        └── index.css
```

---

## Setup

### 1. Prerequisites
Node.js 18+ (tested on 20 and 22).

### 2. Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### 3. Model files
Download these three files into `client/public/`:

| File | Source |
|---|---|
| `hand_landmarker.task` | [Download](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task) |
| `face_landmarker.task` | [Download](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) |
| `pose_landmarker_lite.task` | [Download](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task) |

```bash
cd client/public
curl -L -o hand_landmarker.task <url>
curl -L -o face_landmarker.task <url>
curl -L -o pose_landmarker_lite.task <url>
```

### 4. Lesson images (Learn mode)
Place your reference sign images in `client/public/` (e.g. `hello.jpg`, `thanks.jpg`) — filenames must match the `image` field in `LESSONS` inside `LearnTab.jsx`.

---

## Running

| Terminal | Command | Result |
|---|---|---|
| 1 (backend) | `cd server && npm start` | Serves on `http://localhost:4000` |
| 2 (frontend) | `cd client && npm run dev` | Serves on `http://localhost:5173` |

**Port already in use?**
```bash
lsof -ti :4000 | xargs kill -9      # kill whatever's on port 4000
# or run on a different port:
PORT=4001 npm start                 # then update SOCKET_URL in App.jsx to match
```

---

## Playing Over LAN

1. Find your machine's local IP: `ipconfig getifaddr en0` (Mac).
2. Update `SOCKET_URL` in `client/src/App.jsx`:
   ```js
   const SOCKET_URL = "http://<YOUR_LAN_IP>:4000";
   ```
3. Restart the frontend dev server.
4. Your opponent visits `http://<YOUR_LAN_IP>:5173` — **not** `localhost`.

**Requirements:**
- Both devices on the same Wi-Fi network, with AP isolation disabled (a personal hotspot works as a fallback).
- Webcam access and WebRTC both require a secure context over LAN. Either enable Chrome's `chrome://flags/#unsafely-treat-insecure-origin-as-secure` for your IP, or set up local HTTPS via `mkcert`.
- Only STUN is configured for WebRTC (no TURN). Strict corporate/campus networks may block direct peer connections entirely.

---

## Game Flow

1. Player A clicks **Create Room** and shares the 4-letter code.
2. Player B clicks **Join Room** and enters the code — both video feeds connect via WebRTC.
3. Both players click **I'm Ready!**.
4. Each round opens with a 3-second "Ready · Set · Go!" countdown showing the prompt.
5. A 20-second timer and landmark recording start together. Click **Submit Sign** to grade early, or let the timer expire.
6. The round ends once both players submit, or the timer runs out — whichever is first.
7. After 3 rounds, total Aura Points decide the winner (ties broken by cumulative response speed). Players can **Rematch** (resets score, same room) or **End Game** (returns to lobby).

---

## Grading Methodology

Grading is a **landmark-based heuristic**, not a trained sign-classification model — building one requires a labeled ASL dataset, which is outside the scope of this project. Instead, it scores:

- **Presence** — how consistently the hand was tracked during the attempt.
- **Motion appropriateness** (Battle mode) — whether hand movement matched what's expected for single-word vs. multi-word prompts.
- **Centeredness/stability** (Learn mode) — how steadily the hand was held in frame.

To upgrade to true reference-based grading, capture correct landmark sequences per prompt and populate `REFERENCE_SEQUENCES` in `gestureScoring.js` — the included `dtwDistance()` function will then be used automatically for real comparison via Dynamic Time Warping.

**Note:** accuracy is computed client-side and trusted by the server as-is. Sufficient for casual/demo use; not tamper-resistant against a technical user inspecting DevTools.

---

## Socket.io Event Reference

| Event | Direction | Payload |
|---|---|---|
| `create_room` | client → server | `{ name }` → callback `{ success, roomCode }` |
| `join_room` | client → server | `{ roomCode, name }` → callback `{ success, roomCode?, error? }` |
| `player_ready` | client → server | `{ roomCode }` |
| `submit_sign` | client → server | `{ roomCode, accuracy }` |
| `request_rematch` | client → server | `{ roomCode }` |
| `leave_room` | client → server | `{ roomCode }` |
| `webrtc_signal` | both directions | `{ roomCode, signal }` (relayed only, never stored) |
| `game_state_update` | server → client | `{ code, players: [{id, name, score, ready, rematchRequested}], round, totalRounds, prompt, status }` |
| `round_countdown` | server → client | `{ round, prompt }` |
| `round_start` | server → client | `{ round, prompt, durationMs }` (20000) |
| `round_result` | server → client | `{ round, results: [{id, name, roundAccuracy, totalScore}] }` |
| `game_over` | server → client | `{ winnerId, forfeit?, finalScores }` |
| `rematch_started` | server → client | *(no payload — clients reset local UI)* |
| `opponent_left` | server → client | `{ id }` |

**Room status lifecycle:** `waiting` → `ready_check` → `in_progress` → `finished` → (rematch) back to `ready_check`, or room deleted on `leave_room` / disconnect.

---

## Known Limitations

- Grading is a heuristic, not a trained classifier (see above).
- Client-reported accuracy is trusted without server-side verification.
- Loading three MediaPipe models concurrently increases initial load time versus a single-model setup.
- Face and pose landmarks are tracked and rendered but not yet factored into the grading score (hand landmarks only, currently).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `vite: command not found` / `Cannot find module 'express'` | Run `npm install` in the affected folder (`client/` or `server/`). |
| `EADDRINUSE` on port 4000 | `lsof -ti :4000 \| xargs kill -9`, then retry `npm start`. |
| Opponent can't connect with your room code | They're likely using `localhost` instead of your LAN IP — see [Playing Over LAN](#playing-over-lan). |
| No hand/face/pose overlay | Confirm all three `.task` files are in `client/public/`; check browser console for 404s. |
| Opponent's video never connects | Check both browser consoles for WebRTC errors — strict networks may require a TURN server. |
| `SharedArrayBuffer` / WASM errors | Confirm COOP/COEP headers are set in `vite.config.js`; hard-refresh after any config change. |
