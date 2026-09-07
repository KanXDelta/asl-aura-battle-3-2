import { useState, useEffect, useRef, useCallback } from "react";
import useBodyTracking from "./useBodyTracking";
import { scoreLessonAttempt } from "./gestureScoring";

const LESSONS = [
  { id: "hello", label: "Hello", image: "/hello.jpg" },
  { id: "thank_you", label: "Thank You", image: "/thanks.jpg" },
  { id: "please", label: "Please", image: "/please.jpg" },
  { id: "sorry", label: "Sorry", image: "/sorry.jpg" },
  { id: "yes", label: "Yes", image: "/yes.jpg" },
  { id: "no", label: "No", image: "/no.jpg" },
  { id: "help", label: "Help", image: "/help.jpg" },
  { id: "more", label: "More", image: "/more.jpg" },
  { id: "stop", label: "Stop", image: "/stop.jpg" },
  { id: "wait", label: "Wait", image: "/wait.jpg" },
  { id: "again", label: "Again", image: "/again.jpg" },
  { id: "understand", label: "Understand", image: "/understand.jpg" },
  { id: "happy", label: "Happy", image: "/happy.jpg" },
  { id: "love", label: "Love", image: "/love.jpg" },
  { id: "friend", label: "Friend", image: "/friend.jpg" },
];

const PASS_THRESHOLD = 70;
const ATTEMPT_DURATION_MS = 3000;
const STORAGE_KEY = "asl_aura_learn_progress";

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export default function LearnTab() {
  const [progress, setProgress] = useState(loadProgress);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAttempting, setIsAttempting] = useState(false);
  const [lastScore, setLastScore] = useState(null);
  const [lastDetail, setLastDetail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [camReady, setCamReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const attemptTimerRef = useRef(null);

  const activeLesson = LESSONS[activeIndex];

  const { isReady, startDetection, stopDetection, startRecording, stopRecording } =
    useBodyTracking(videoRef, canvasRef);

  useEffect(() => {
    let stream;
    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setCamReady(true);
          };
        }
      } catch (err) {
        console.error("Webcam permission denied or unavailable:", err);
      }
    }
    startCam();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (isReady && camReady) startDetection();
    return () => stopDetection();
  }, [isReady, camReady, startDetection, stopDetection]);

  useEffect(() => {
    setImageFailed(false);
  }, [activeIndex]);

  // FIX: functional state updates (prev => ...) instead of reading `progress`
  // / `activeIndex` directly from the outer closure. Reading them directly
  // caused a stale-closure bug -- handleStartAttempt was memoized with deps
  // that never change, so it (and everything it called) permanently froze
  // on whatever lesson/progress existed at the very first render, meaning
  // every "Try It" click always operated on lesson index 0 regardless of
  // which lesson was actually on screen.
  const finishAttempt = useCallback((score, detail) => {
    setIsAttempting(false);
    setLastScore(score);
    setLastDetail(detail);

    if (score >= PASS_THRESHOLD) {
      setFeedback(`Nice! Score: ${score.toFixed(0)} — Lesson complete!`);
      setProgress((prev) => {
        const updated = {
          ...prev,
          [activeLesson.id]: { completed: true, bestScore: Math.max(score, prev[activeLesson.id]?.bestScore || 0) },
        };
        saveProgress(updated);
        return updated;
      });

      setTimeout(() => {
        setActiveIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          if (nextIndex < LESSONS.length) {
            setLastScore(null);
            setLastDetail("");
            setFeedback("");
            return nextIndex;
          }
          setFeedback("You've completed every lesson! 🎉 Revisit any lesson below.");
          return prevIndex;
        });
      }, 1500);
    } else {
      setFeedback(`Score: ${score.toFixed(0)} — try again (need ${PASS_THRESHOLD}+).`);
      setProgress((prev) => {
        const existing = prev[activeLesson.id];
        if (score > (existing?.bestScore || 0)) {
          const updated = {
            ...prev,
            [activeLesson.id]: { completed: existing?.completed || false, bestScore: score },
          };
          saveProgress(updated);
          return updated;
        }
        return prev;
      });
    }
  }, [activeLesson]);

  const handleStartAttempt = useCallback(() => {
    setIsAttempting(true);
    setLastScore(null);
    setLastDetail("");
    setFeedback("Recording... hold the sign");
    startRecording();

    attemptTimerRef.current = setTimeout(() => {
      const sequence = stopRecording();
      const result = scoreLessonAttempt(sequence);
      finishAttempt(result.score, result.detail);
    }, ATTEMPT_DURATION_MS);
  }, [startRecording, stopRecording, finishAttempt]);

  useEffect(() => {
    return () => clearTimeout(attemptTimerRef.current);
  }, []);

  const selectLesson = (index) => {
    clearTimeout(attemptTimerRef.current);
    setIsAttempting(false);
    setLastScore(null);
    setLastDetail("");
    setFeedback("");
    setActiveIndex(index);
  };

  const completedCount = Object.values(progress).filter((p) => p.completed).length;

  return (
    <div className="flex flex-col h-full w-full p-6 gap-6 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
          Learn ASL
        </h2>
        <span className="text-slate-400 text-sm font-mono">
          {completedCount} / {LESSONS.length} lessons complete
        </span>
      </div>

      <div className="max-w-7xl mx-auto w-full flex flex-1 gap-6">
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 rounded-2xl p-6">
          <p className="text-slate-300 mb-3 font-semibold">{activeLesson.label}</p>
          <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-800 flex items-center justify-center overflow-hidden">
            {imageFailed ? (
              <span className="text-slate-500 text-sm text-center px-4 py-16">
                Image not found — make sure {activeLesson.image} is in client/public/
              </span>
            ) : (
              <img
                src={activeLesson.image}
                alt={activeLesson.label}
                onError={() => setImageFailed(true)}
                className="w-full h-auto object-contain"
              />
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 rounded-2xl p-6">
          <div className="relative w-full max-w-4xl aspect-video rounded-xl overflow-hidden ring-2 ring-fuchsia-500 bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover -scale-x-100"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none"
            />
            {isAttempting && (
              <span className="absolute top-2 left-2 flex items-center gap-1.5 text-xs bg-black/60 backdrop-blur px-2.5 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Recording
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={handleStartAttempt}
              disabled={!isReady || !camReady || isAttempting}
              className="px-8 py-3 rounded-2xl font-bold tracking-wide transition-all shadow-lg
                bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500
                disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
            >
              {isAttempting ? "🔴 Recording..." : "Try It"}
            </button>
            {feedback && <p className="text-slate-300 text-sm">{feedback}</p>}
            {lastScore !== null && (
              <div className="text-center">
                <p className={`font-bold text-lg ${lastScore >= PASS_THRESHOLD ? "text-emerald-400" : "text-amber-400"}`}>
                  {lastScore.toFixed(0)} / 100
                </p>
                {lastDetail && <p className="text-xs text-slate-500">{lastDetail}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {LESSONS.map((lesson, index) => {
          const done = progress[lesson.id]?.completed;
          const active = index === activeIndex;
          return (
            <button
              key={lesson.id}
              onClick={() => selectLesson(index)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
                active
                  ? "bg-indigo-600 border-indigo-400 text-white"
                  : done
                  ? "bg-emerald-900 border-emerald-600 text-emerald-300"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {done ? "✓ " : ""}
              {lesson.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
