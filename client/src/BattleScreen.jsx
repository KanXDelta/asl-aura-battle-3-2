import { useEffect, useRef, useState, useCallback } from "react";
import { useBodyTracking } from "./useBodyTracking";
import { usePeerVideo } from "./usePeerVideo";
import { scoreRecordedSequence } from "./gestureScoring";

export default function BattleScreen({ socket, roomCode, isRoomCreator, onExit }) {
  const localVideoRef = useRef(null);
  const localCanvasRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);

  const [gameState, setGameState] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [roundDurationMs, setRoundDurationMs] = useState(20000);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [hasSubmittedThisRound, setHasSubmittedThisRound] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [camReady, setCamReady] = useState(false);
  const [iAmReady, setIAmReady] = useState(false);
  const [countdownPrompt, setCountdownPrompt] = useState(null);
  const [iWantRematch, setIWantRematch] = useState(false);

  const { frame, isReady, loadError, startDetection, startRecording, stopRecording } =
    useBodyTracking(localVideoRef, localCanvasRef);

  const bothPlayersPresent = gameState?.players?.length === 2;
  const { remoteStream, connectionState } = usePeerVideo(
    socket, roomCode, localStream, isRoomCreator, bothPlayersPresent
  );

  useEffect(() => {
    async function startCam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.onloadedmetadata = () => {
            localVideoRef.current.play();
            setCamReady(true);
          };
        }
      } catch (err) {
        console.error("Webcam permission denied or unavailable:", err);
      }
    }
    startCam();
  }, []);

  useEffect(() => {
    if (isReady && camReady) startDetection();
  }, [isReady, camReady, startDetection]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleSubmitSign = useCallback(() => {
    if (hasSubmittedThisRound) return;
    const sequence = stopRecording();
    setIsRecording(false);
    const accuracy = scoreRecordedSequence(sequence, prompt);
    socket.emit("submit_sign", { roomCode, accuracy });
    setHasSubmittedThisRound(true);
  }, [hasSubmittedThisRound, stopRecording, prompt, roomCode, socket]);

  const handleRequestRematch = useCallback(() => {
    setIWantRematch(true);
    socket.emit("request_rematch", { roomCode });
  }, [roomCode, socket]);

  const handleEndGame = useCallback(() => {
    socket.emit("leave_room", { roomCode });
    onExit();
  }, [roomCode, socket, onExit]);

  useEffect(() => {
    socket.on("game_state_update", (state) => setGameState(state));
    socket.on("player_joined", (state) => setGameState(state));

    socket.on("round_countdown", ({ prompt: nextPrompt }) => {
      setCountdownPrompt(nextPrompt);
      setRoundResult(null);
      setHasSubmittedThisRound(false);
      setIsRecording(false);
    });

    socket.on("round_start", ({ prompt: newPrompt, durationMs }) => {
      setCountdownPrompt(null);
      setPrompt(newPrompt);
      setRoundDurationMs(durationMs);
      setRoundTimeLeft(durationMs);
      startRecording();
      setIsRecording(true);
    });

    socket.on("round_result", (data) => {
      setRoundResult(data);
      setIsRecording(false);
    });
    socket.on("game_over", (data) => setGameOver(data));

    socket.on("rematch_started", () => {
      setGameOver(null);
      setRoundResult(null);
      setPrompt(null);
      setHasSubmittedThisRound(false);
      setIAmReady(false);
      setIWantRematch(false);
      setCountdownPrompt(null);
    });

    socket.on("opponent_left", () => console.warn("Opponent disconnected/left the room."));

    return () => {
      socket.off("game_state_update");
      socket.off("player_joined");
      socket.off("round_countdown");
      socket.off("round_start");
      socket.off("round_result");
      socket.off("game_over");
      socket.off("rematch_started");
      socket.off("opponent_left");
    };
  }, [socket, startRecording]);

  useEffect(() => {
    if (roundTimeLeft <= 0 || !isRecording) return;
    const interval = setInterval(() => {
      setRoundTimeLeft((t) => {
        const next = Math.max(0, t - 200);
        if (next === 0 && !hasSubmittedThisRound) {
          handleSubmitSign();
        }
        return next;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [roundTimeLeft, isRecording, hasSubmittedThisRound, handleSubmitSign]);

  const me = gameState?.players?.find((p) => p.id === socket.id);
  const opponent = gameState?.players?.find((p) => p.id !== socket.id);
  const showReadyScreen = gameState?.status === "ready_check";
  const progressPct = roundDurationMs > 0 ? (roundTimeLeft / roundDurationMs) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col aspect-video overflow-hidden">
      <div className="flex items-center justify-between px-8 py-4 bg-slate-900/70 backdrop-blur-md border-b border-white/5 shadow-lg">
        <ScoreBadge label={me?.name || "You"} score={me?.score ?? 0} gradient="from-fuchsia-500 to-purple-500" />

        <div className="text-center flex-1 px-6">
          <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em] mb-1">
            Round {gameState?.round || 1} of {gameState?.totalRounds || 3}
          </p>
          <h2 className="text-3xl font-black bg-gradient-to-r from-fuchsia-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent tracking-tight">
            {prompt || "Get ready..."}
          </h2>
          <div className="mt-2 h-2 w-64 mx-auto bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                isRecording ? "bg-gradient-to-r from-red-500 to-fuchsia-500" : "bg-slate-700"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">{(roundTimeLeft / 1000).toFixed(1)}s remaining</p>
        </div>

        <ScoreBadge label={opponent?.name || "Opponent"} score={opponent?.score ?? 0} gradient="from-cyan-400 to-sky-500" align="right" />
      </div>

      <div className="flex-1 grid grid-cols-2 gap-3 p-3">
        <VideoPanel
          videoRef={localVideoRef}
          canvasRef={localCanvasRef}
          mirrored
          label={me?.name || "You"}
          statusText={frame?.hands ? "Tracking hand" : "No hand detected"}
          ringColor="ring-fuchsia-500"
          isRecording={isRecording}
        />
        <VideoPanel
          videoRef={remoteVideoRef}
          mirrored={false}
          label={opponent?.name || "Opponent"}
          statusText={
            !bothPlayersPresent
              ? "Waiting for opponent to join..."
              : connectionState === "connected"
              ? "Live"
              : connectionState === "connecting"
              ? "Connecting video..."
              : connectionState === "failed"
              ? "Connection failed -- see troubleshooting"
              : "Waiting for opponent's video..."
          }
          ringColor="ring-cyan-500"
          placeholder={connectionState !== "connected"}
        />
      </div>

      <div className="px-8 py-4 bg-slate-900/70 backdrop-blur-md border-t border-white/5 flex items-center justify-center gap-4">
        <button
          onClick={handleSubmitSign}
          disabled={hasSubmittedThisRound || !isRecording}
          className="px-8 py-3 rounded-2xl font-bold tracking-wide transition-all shadow-lg
            bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500
            disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
        >
          {hasSubmittedThisRound ? "✅ Sign submitted" : isRecording ? "🔴 Submit Sign" : "Waiting for round..."}
        </button>
        <span className="text-xs text-slate-500 font-mono">Room {roomCode}</span>
      </div>

      {loadError && (
        <div className="fixed bottom-4 right-4 bg-red-950/90 border border-red-700 text-red-200 text-xs rounded-xl px-4 py-3 max-w-xs">
          Tracking model failed to load. Check that hand_landmarker.task, face_landmarker.task, and
          pose_landmarker_lite.task are all in client/public/.
        </div>
      )}

      {showReadyScreen && (
        <Overlay>
          <h3 className="text-2xl font-black mb-4 bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
            Both players connected!
          </h3>
          <p className="text-slate-300 mb-1">{me?.name || "You"}: {me?.ready ? "Ready ✅" : "Not ready"}</p>
          <p className="text-slate-300 mb-6">{opponent?.name || "Opponent"}: {opponent?.ready ? "Ready ✅" : "Waiting..."}</p>
          <PrimaryButton onClick={() => { setIAmReady(true); socket.emit("player_ready", { roomCode }); }} disabled={iAmReady}>
            {iAmReady ? "Waiting for opponent..." : "I'm Ready!"}
          </PrimaryButton>
        </Overlay>
      )}

      {countdownPrompt && !showReadyScreen && (
        <Overlay>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-3">Get ready to sign</p>
          <h3 className="text-5xl font-black bg-gradient-to-r from-fuchsia-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent mb-3">
            {countdownPrompt}
          </h3>
          <p className="text-slate-300 tracking-widest">Ready&nbsp;•&nbsp;Set&nbsp;•&nbsp;Go!</p>
        </Overlay>
      )}

      {roundResult && !gameOver && !countdownPrompt && (
        <Overlay>
          <h3 className="text-xl font-bold mb-4">Round {roundResult.round} results</h3>
          <div className="space-y-2">
            {roundResult.results.map((r) => (
              <p key={r.id} className="text-slate-300">
                <span className="font-semibold text-white">{r.name}</span>: {r.roundAccuracy}% accuracy — total{" "}
                <span className="text-fuchsia-300 font-bold">{r.totalScore}</span> Aura
              </p>
            ))}
          </div>
        </Overlay>
      )}

      {gameOver && (
        <Overlay>
          <div className="text-5xl mb-3">{gameOver.winnerId === socket.id ? "🏆" : gameOver.winnerId ? "💔" : "🤝"}</div>
          <h3 className="text-2xl font-black mb-4">
            {gameOver.forfeit
              ? gameOver.winnerId === socket.id
                ? "You win by forfeit — opponent disconnected."
                : "Game ended — opponent disconnected."
              : gameOver.winnerId === socket.id
              ? "You win the match!"
              : gameOver.winnerId
              ? "You lost the match."
              : "It's a tie!"}
          </h3>
          <div className="space-y-1 mb-6">
            {gameOver.finalScores.map((r) => (
              <p key={r.id} className="text-slate-300">
                {r.name}: <span className="font-bold text-cyan-300">{r.score}</span> Aura Points
              </p>
            ))}
          </div>

          {gameOver.forfeit ? (
            <PrimaryButton onClick={handleEndGame}>Back to Lobby</PrimaryButton>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <PrimaryButton onClick={handleRequestRematch} disabled={iWantRematch}>
                {iWantRematch ? "Waiting for opponent..." : "🔁 Rematch"}
              </PrimaryButton>
              <button
                onClick={handleEndGame}
                className="px-8 py-3 rounded-2xl font-bold tracking-wide transition-all
                  bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                🚪 End Game
              </button>
            </div>
          )}
          {!gameOver.forfeit && opponent?.rematchRequested && !iWantRematch && (
            <p className="text-xs text-cyan-300 mt-4">{opponent.name} wants a rematch!</p>
          )}
        </Overlay>
      )}
    </div>
  );
}

function VideoPanel({ videoRef, canvasRef, mirrored, label, statusText, ringColor, isRecording, placeholder }) {
  return (
    <div className={`relative bg-slate-900 rounded-2xl overflow-hidden ring-2 ${ringColor} shadow-2xl`}>
      <video
        ref={videoRef}
        autoPlay
        muted={!!canvasRef}
        playsInline
        className={`w-full h-full object-cover ${mirrored ? "-scale-x-100" : ""} ${placeholder ? "opacity-0" : ""}`}
      />
      {canvasRef && (
        <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-cover ${mirrored ? "-scale-x-100" : ""} pointer-events-none`} />
      )}
      {placeholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
          <span className="text-3xl">📷</span>
          <span className="text-sm text-center px-4">{statusText}</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 text-xs bg-black/60 backdrop-blur px-2.5 py-1.5 rounded-full">
        {isRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
        <span>{label}</span>
        {!placeholder && <span className="text-slate-400">· {statusText}</span>}
      </div>
    </div>
  );
}

function ScoreBadge({ label, score, gradient, align = "left" }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-4xl font-black bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>{score}</p>
      <p className="text-[11px] text-slate-500 uppercase tracking-wider">Aura Points</p>
    </div>
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="px-8 py-3 rounded-2xl font-bold tracking-wide transition-all shadow-lg
        bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500
        disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

function Overlay({ children }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900/95 border border-white/10 rounded-3xl p-10 text-center min-w-[360px] shadow-2xl">
        {children}
      </div>
    </div>
  );
}
