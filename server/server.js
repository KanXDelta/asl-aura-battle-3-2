import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 4000;
const ROUND_TIME_MS = 20000;
const READY_COUNTDOWN_MS = 3000;
const TOTAL_ROUNDS = 3;
const PROMPTS = ["Water", "Need Water", "Please Help Me"];

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function createRoom() {
  let code;
  do { code = generateRoomCode(); } while (rooms[code]);
  rooms[code] = {
    code, players: [], round: 0, scores: {}, totalTimeMs: {},
    roundSubmissions: {}, roundTimer: null, status: "waiting",
  };
  return code;
}

function getRoomState(room) {
  return {
    code: room.code,
    players: room.players.map((p) => ({
      id: p.socketId, name: p.name, score: room.scores[p.socketId] || 0,
      ready: !!p.ready, rematchRequested: !!p.rematchRequested,
    })),
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    prompt: PROMPTS[room.round - 1] || null,
    status: room.status,
  };
}

function broadcastState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit("game_state_update", getRoomState(room));
}

function computeAuraPoints(accuracy) {
  return Math.round(Math.max(0, Math.min(100, accuracy)));
}

function startRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.round += 1;
  room.roundSubmissions = {};

  if (room.round > TOTAL_ROUNDS) { endGame(roomCode); return; }

  io.to(roomCode).emit("round_countdown", { round: room.round, prompt: PROMPTS[room.round - 1] });

  setTimeout(() => {
    if (!rooms[roomCode]) return;
    io.to(roomCode).emit("round_start", {
      round: room.round,
      prompt: PROMPTS[room.round - 1],
      durationMs: ROUND_TIME_MS,
    });
    broadcastState(roomCode);
    room.roundStartTime = Date.now();
    room.roundTimer = setTimeout(() => resolveRound(roomCode), ROUND_TIME_MS);
  }, READY_COUNTDOWN_MS);
}

function resolveRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearTimeout(room.roundTimer);

  room.players.forEach((p) => {
    const submission = room.roundSubmissions[p.socketId];
    const accuracy = submission ? submission.accuracy : 0;
    const timeMs = submission ? submission.timeMs : ROUND_TIME_MS;
    room.scores[p.socketId] = (room.scores[p.socketId] || 0) + computeAuraPoints(accuracy);
    room.totalTimeMs[p.socketId] = (room.totalTimeMs[p.socketId] || 0) + timeMs;
  });

  io.to(roomCode).emit("round_result", {
    round: room.round,
    results: room.players.map((p) => ({
      id: p.socketId, name: p.name,
      roundAccuracy: room.roundSubmissions[p.socketId]?.accuracy || 0,
      totalScore: room.scores[p.socketId] || 0,
    })),
  });

  broadcastState(roomCode);

  if (room.status !== "finished") {
    setTimeout(() => startRound(roomCode), 3000);
  }
}

function endGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.status = "finished";
  room.players.forEach((p) => { p.rematchRequested = false; });

  const [p1, p2] = room.players;
  if (!p1 || !p2) {
    const winnerId = p1 ? p1.socketId : null;
    io.to(roomCode).emit("game_over", {
      winnerId, forfeit: true,
      finalScores: room.players.map((p) => ({ id: p.socketId, name: p.name, score: room.scores[p.socketId] || 0 })),
    });
    broadcastState(roomCode);
    return;
  }

  const s1 = room.scores[p1.socketId] || 0;
  const s2 = room.scores[p2.socketId] || 0;
  let winnerId = null;
  if (s1 > s2) winnerId = p1.socketId;
  else if (s2 > s1) winnerId = p2.socketId;
  else {
    const t1 = room.totalTimeMs[p1.socketId] ?? Infinity;
    const t2 = room.totalTimeMs[p2.socketId] ?? Infinity;
    if (t1 < t2) winnerId = p1.socketId;
    else if (t2 < t1) winnerId = p2.socketId;
  }

  io.to(roomCode).emit("game_over", {
    winnerId,
    finalScores: room.players.map((p) => ({ id: p.socketId, name: p.name, score: room.scores[p.socketId] || 0 })),
  });
  broadcastState(roomCode);
}

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on("create_room", ({ name }, callback) => {
    const roomCode = createRoom();
    const room = rooms[roomCode];
    room.players.push({ id: socket.id, socketId: socket.id, name: name || "Player 1", ready: false, rematchRequested: false });
    room.scores[socket.id] = 0;
    room.totalTimeMs[socket.id] = 0;
    socket.join(roomCode);
    callback({ success: true, roomCode });
    broadcastState(roomCode);
  });

  socket.on("join_room", ({ roomCode, name }, callback) => {
    const room = rooms[roomCode];
    if (!room) return callback({ success: false, error: "Room not found" });
    if (room.players.length >= 2) return callback({ success: false, error: "Room full" });

    room.players.push({ id: socket.id, socketId: socket.id, name: name || "Player 2", ready: false, rematchRequested: false });
    room.scores[socket.id] = 0;
    room.totalTimeMs[socket.id] = 0;
    socket.join(roomCode);
    callback({ success: true, roomCode });

    if (room.players.length === 2) {
      room.status = "ready_check";
    }
    io.to(roomCode).emit("player_joined", getRoomState(room));
    broadcastState(roomCode);
  });

  socket.on("player_ready", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== "ready_check") return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.ready = true;
    broadcastState(roomCode);

    if (room.players.length === 2 && room.players.every((p) => p.ready)) {
      room.status = "in_progress";
      broadcastState(roomCode);
      startRound(roomCode);
    }
  });

  socket.on("submit_sign", ({ roomCode, accuracy }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== "in_progress") return;
    if (room.roundSubmissions[socket.id]) return;

    const timeMs = Date.now() - room.roundStartTime;
    room.roundSubmissions[socket.id] = { accuracy, timeMs };
    io.to(roomCode).emit("opponent_submitted", { id: socket.id });

    if (room.players.length > 0 && room.players.every((p) => room.roundSubmissions[p.socketId])) {
      resolveRound(roomCode);
    }
  });

  socket.on("request_rematch", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== "finished") return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    player.rematchRequested = true;
    broadcastState(roomCode);

    if (room.players.length === 2 && room.players.every((p) => p.rematchRequested)) {
      room.round = 0;
      room.roundSubmissions = {};
      room.players.forEach((p) => {
        p.ready = false;
        p.rematchRequested = false;
        room.scores[p.socketId] = 0;
        room.totalTimeMs[p.socketId] = 0;
      });
      room.status = "ready_check";
      io.to(roomCode).emit("rematch_started");
      broadcastState(roomCode);
    }
  });

  socket.on("leave_room", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx === -1) return;

    room.players.splice(idx, 1);
    clearTimeout(room.roundTimer);
    socket.leave(roomCode);
    io.to(roomCode).emit("opponent_left", { id: socket.id });

    if (room.players.length === 0) delete rooms[roomCode];
    else broadcastState(roomCode);
  });

  socket.on("webrtc_signal", ({ roomCode, signal, to }) => {
    if (!to) {
      const room = rooms[roomCode];
      if (!room) return;
      const other = room.players.find((p) => p.socketId !== socket.id);
      if (other) io.to(other.socketId).emit("webrtc_signal", { signal, from: socket.id });
      return;
    }
    io.to(to).emit("webrtc_signal", { signal, from: socket.id });
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const idx = room.players.findIndex((p) => p.socketId === socket.id);
      if (idx === -1) continue;

      room.players.splice(idx, 1);
      clearTimeout(room.roundTimer);
      io.to(code).emit("opponent_left", { id: socket.id });

      if (room.status === "in_progress") {
        endGame(code);
      } else {
        broadcastState(code);
      }

      if (room.players.length === 0) delete rooms[code];
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`ASL Aura Battle server running on http://localhost:${PORT}`);
});