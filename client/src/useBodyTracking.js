import { useEffect, useRef, useState, useCallback } from "react";
import {
  HandLandmarker,
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

export function useBodyTracking(videoRef, canvasRef) {
  const handRef = useRef(null);
  const faceRef = useRef(null);
  const poseRef = useRef(null);
  const drawingUtilsRef = useRef(null);
  const rafRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [frame, setFrame] = useState({ hands: null, face: null, pose: null });

  const isRecordingRef = useRef(false);
  const recordingBufferRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        const [hand, face, pose] = await Promise.all([
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/hand_landmarker.task", delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 1,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/face_landmarker.task", delegate: "GPU" },
            runningMode: "VIDEO",
            numFaces: 1,
          }),
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/pose_landmarker_lite.task", delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 1,
          }),
        ]);

        if (cancelled) return;
        handRef.current = hand;
        faceRef.current = face;
        poseRef.current = pose;
        setIsReady(true);
      } catch (err) {
        console.error("Failed to load one or more MediaPipe models:", err);
        if (!cancelled) setLoadError(err);
      }
    }

    init();

    return () => {
      cancelled = true;
      handRef.current?.close();
      faceRef.current?.close();
      poseRef.current?.close();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const detectFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef?.current;
    if (!video || video.readyState < 2 || !handRef.current || !faceRef.current || !poseRef.current) {
      rafRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    if (canvas && !drawingUtilsRef.current) {
      drawingUtilsRef.current = new DrawingUtils(canvas.getContext("2d"));
    }

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const now = performance.now();

      const handResult = handRef.current.detectForVideo(video, now);
      const faceResult = faceRef.current.detectForVideo(video, now);
      const poseResult = poseRef.current.detectForVideo(video, now);

      const hands = handResult.landmarks?.[0] || null;
      const face = faceResult.faceLandmarks?.[0] || null;
      const pose = poseResult.landmarks?.[0] || null;

      setFrame({ hands, face, pose });

      if (isRecordingRef.current) {
        recordingBufferRef.current.push({ t: now, hands, face, pose });
      }

      const ctx = canvas ? canvas.getContext("2d") : null;
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (pose && drawingUtilsRef.current) {
          drawingUtilsRef.current.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, {
            color: "#38bdf8",
            lineWidth: 3,
          });
        }
        if (face && drawingUtilsRef.current) {
          drawingUtilsRef.current.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_CONTOURS, {
            color: "#facc15",
            lineWidth: 1,
          });
        }
        if (hands && drawingUtilsRef.current) {
          drawingUtilsRef.current.drawConnectors(hands, HandLandmarker.HAND_CONNECTIONS, {
            color: "#a855f7",
            lineWidth: 4,
          });
          drawingUtilsRef.current.drawLandmarks(hands, {
            color: "#22d3ee",
            lineWidth: 1,
            radius: 4,
          });
        }
      }
    }

    rafRef.current = requestAnimationFrame(detectFrame);
  }, [videoRef, canvasRef]);

  const startDetection = useCallback(() => {
    if (isReady) rafRef.current = requestAnimationFrame(detectFrame);
  }, [isReady, detectFrame]);

  const stopDetection = useCallback(() => cancelAnimationFrame(rafRef.current), []);

  const startRecording = useCallback(() => {
    recordingBufferRef.current = [];
    isRecordingRef.current = true;
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    return recordingBufferRef.current;
  }, []);

  return {
    frame,
    isReady,
    loadError,
    startDetection,
    stopDetection,
    startRecording,
    stopRecording,
  };
}
export default useBodyTracking;
