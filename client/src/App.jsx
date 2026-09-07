import LearnTab from "./LearnTab";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import BattleScreen from "./BattleScreen";

const SOCKET_URL = "http://172.20.10.9:4000";

export default function App() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("Player");
  const [inRoom, setInRoom] = useState(false);
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(null);
  const [activeTab, setActiveTab] = useState("battle");

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    return () => socket.disconnect();
  }, []);

  const handleCreateRoom = () => {
    setLoading("create");
    setError("");
    socketRef.current.emit("create_room", { name }, (res) => {
      setLoading(null);
      if (res.success) {
        setRoomCode(res.roomCode);
        setIsRoomCreator(true);
        setInRoom(true);
      } else {
        setError(res.error || "Failed to create room");
      }
    });
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) {
      setError("Enter a room code first");
      return;
    }
    setLoading("join");
    setError("");
    socketRef.current.emit(
      "join_room",
      { roomCode: joinCode.toUpperCase(), name },
      (res) => {
        setLoading(null);
        if (res.success) {
          setRoomCode(res.roomCode);
          setIsRoomCreator(false);
          setInRoom(true);
        } else {
          setError(res.error || "Failed to join room");
        }
      }
    );
  };

  const handleExitToLobby = () => {
    setInRoom(false);
    setRoomCode("");
    setJoinCode("");
    setIsRoomCreator(false);
  };

  if (inRoom) {
    return (
      <BattleScreen
        socket={socketRef.current}
        roomCode={roomCode}
        isRoomCreator={isRoomCreator}
        onExit={handleExitToLobby}
      />
    );
  }

  if (activeTab === "learn") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="relative">
          <div className="text-center pt-10 pb-2">
            <p className="text-5xl mb-2">🤟</p>
            <h1 className="text-4xl font-black tracking-tight">
              ASL <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">Aura</span> Battle
            </h1>
            <p className="text-slate-400 text-sm mt-2 flex items-center justify-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
              {connected ? "Connected to server" : "Connecting..."}
            </p>

            <div className="flex gap-4 justify-center mt-6">
              <button
                onClick={() => setActiveTab("battle")}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  activeTab === "battle"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Battle
              </button>
              <button
                onClick={() => setActiveTab("learn")}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  activeTab === "learn"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Learn
              </button>
            </div>
          </div>

          <LearnTab />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />

      <div className="relative bg-slate-900/70 backdrop-blur-xl rounded-3xl p-10 w-[420px] shadow-2xl border border-white/10">
        <div className="text-center mb-8">
          <p className="text-5xl mb-2">🤟</p>
          <h1 className="text-4xl font-black tracking-tight">
            ASL <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">Aura</span> Battle
          </h1>
          <p className="text-slate-400 text-sm mt-2 flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
            {connected ? "Connected to server" : "Connecting..."}
          </p>
        </div>

        <div className="flex gap-4 justify-center mb-6">
          <button
            onClick={() => setActiveTab("battle")}
            className={`px-4 py-2 rounded-lg font-bold transition-all ${
              activeTab === "battle"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Battle
          </button>
          <button
            onClick={() => setActiveTab("learn")}
            className={`px-4 py-2 rounded-lg font-bold transition-all ${
              activeTab === "learn"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Learn
          </button>
        </div>

        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Your name</label>
        <input
          className="w-full mb-5 px-4 py-3 rounded-xl bg-slate-800/80 border border-white/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 transition"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button
          onClick={handleCreateRoom}
          disabled={loading !== null}
          className="w-full mb-5 py-3 rounded-xl font-bold tracking-wide transition-all shadow-lg
            bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500
            disabled:opacity-50"
        >
          {loading === "create" ? "Creating room..." : "🎮 Create Room"}
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-slate-500 text-xs font-semibold">OR JOIN</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <input
          className="w-full mb-4 px-4 py-3 rounded-xl bg-slate-800/80 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500 uppercase tracking-[0.3em] text-center font-mono transition"
          placeholder="ROOM CODE"
          value={joinCode}
          maxLength={4}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button
          onClick={handleJoinRoom}
          disabled={loading !== null}
          className="w-full py-3 rounded-xl font-bold tracking-wide transition-all shadow-lg
            bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500
            disabled:opacity-50"
        >
          {loading === "join" ? "Joining..." : "🔗 Join Room"}
        </button>

        {roomCode && (
          <p className="mt-5 text-center text-sm text-slate-400">
            Room code: <span className="font-mono font-bold text-fuchsia-300 tracking-widest">{roomCode}</span>
          </p>
        )}
        {error && <p className="mt-4 text-center text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  );
}
