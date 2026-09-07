import { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";

/**
 * Establishes a direct WebRTC connection to the other player, signaled over
 * the existing Socket.io connection. Reuses the SAME local media stream
 * already captured for hand/face/pose tracking -- no second getUserMedia call.
 *
 * IMPORTANT: `readyToConnect` must only become true once BOTH players are
 * confirmed present in the room. Starting the handshake before the second
 * player has joined causes the initial offer signal to be silently dropped
 * server-side (there's no one to relay it to yet), permanently breaking the
 * connection even after the second player arrives.
 *
 * isInitiator should be true for exactly one side (the room creator).
 */
export function usePeerVideo(socket, roomCode, localStream, isInitiator, readyToConnect) {
  const peerRef = useRef(null);
  const pendingSignalsRef = useRef([]); // buffers inbound signals that arrive before our Peer exists
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("idle"); // idle | connecting | connected | failed

  // Always listen for inbound signals, even before our own Peer is created,
  // so nothing sent by the other side gets lost to a race condition.
  useEffect(() => {
    if (!socket) return;
    const handleSignal = ({ signal }) => {
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.signal(signal);
      } else {
        pendingSignalsRef.current.push(signal);
      }
    };
    socket.on("webrtc_signal", handleSignal);
    return () => socket.off("webrtc_signal", handleSignal);
  }, [socket]);

  useEffect(() => {
    if (!socket || !roomCode || !localStream || !readyToConnect) return;

    setConnectionState("connecting");
    const peer = new Peer({
      initiator: isInitiator,
      trickle: true,
      stream: localStream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });
    peerRef.current = peer;

    // Flush any signals that arrived before this Peer existed.
    if (pendingSignalsRef.current.length > 0) {
      pendingSignalsRef.current.forEach((signal) => peer.signal(signal));
      pendingSignalsRef.current = [];
    }

    peer.on("signal", (signal) => {
      socket.emit("webrtc_signal", { roomCode, signal });
    });

    peer.on("stream", (stream) => {
      setRemoteStream(stream);
      setConnectionState("connected");
    });

    peer.on("error", (err) => {
      console.error("WebRTC peer error:", err);
      setConnectionState("failed");
    });

    peer.on("close", () => {
      setConnectionState("idle");
      setRemoteStream(null);
    });

    return () => {
      peer.destroy();
      peerRef.current = null;
    };
  }, [socket, roomCode, localStream, isInitiator, readyToConnect]);

  return { remoteStream, connectionState };
}
