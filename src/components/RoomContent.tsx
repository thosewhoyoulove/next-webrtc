"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/router";
import io, { Socket } from "socket.io-client";
import { useSubtitleRecognizer } from "@/hooks/useSubtitleRecognizer";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------
type ConnectionPhase = "waiting" | "connected";
type SocketStatus = "connecting" | "online" | "offline";

interface ChatMessage {
    text: string;
    sender: "me" | "peer";
    time: string;
}

// -----------------------------------------------------------------------
// Helper: format HH:MM
// -----------------------------------------------------------------------
function nowTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------
export default function RoomContent() {
    const router = useRouter();
    const { id: roomId } = router.query;

    // --- Video Refs ---
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // --- WebRTC / Socket Refs ---
    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<RTCPeerConnection | null>(null);

    // --- Connection phase (Feature 1: Waiting Room) ---
    const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("waiting");

    // --- Socket / Network Status (Feature 4: Disconnect Awareness) ---
    const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");

    // --- Local AV controls ---
    const [isMuted, setIsMuted] = useState(false);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [peerVolume, setPeerVolume] = useState(true);

    // --- Recording ---
    const [recording, setRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);

    // --- Subtitle recognition ---
    const { subtitle, startRecognition, stopRecognition } = useSubtitleRecognizer("zh-CN");

    // --- Feature 3: Text Chat ---
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // --- Copied feedback ---
    const [copied, setCopied] = useState(false);

    // -----------------------------------------------------------------------
    // Auto-scroll chat to bottom
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (isChatOpen) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
            setUnreadCount(0);
        }
    }, [messages, isChatOpen]);

    // -----------------------------------------------------------------------
    // Core WebRTC + Socket Effects
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!roomId) return;
        localStorage.setItem("lastRoomId", roomId as string);

        // Connect to signaling server
        socketRef.current = io("https://webrtc.peterroe.me/");

        // --- Feature 4: Socket Status listeners ---
        socketRef.current.on("connect", () => setSocketStatus("online"));
        socketRef.current.on("disconnect", () => {
            setSocketStatus("offline");
            setConnectionPhase("waiting");
        });
        socketRef.current.on("connect_error", () => setSocketStatus("offline"));
        socketRef.current.on("reconnect", () => setSocketStatus("online"));
        socketRef.current.on("reconnecting", () => setSocketStatus("connecting"));

        // Get local media
        navigator.mediaDevices
            .getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
                audio: true,
            })
            .then(stream => {
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;

                peerRef.current = new RTCPeerConnection();
                stream.getTracks().forEach(track => peerRef.current?.addTrack(track, stream));

                // Remote video track
                peerRef.current.ontrack = event => {
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
                };

                // ICE
                peerRef.current.onicecandidate = event => {
                    if (event.candidate) socketRef.current?.emit("ice-candidate", { candidate: event.candidate, roomId });
                };

                // Join room
                socketRef.current?.emit("join-room", roomId);

                // --- Feature 1: Waiting Room => connected on peer arrived ---
                socketRef.current?.on("user-joined", async () => {
                    setConnectionPhase("connected");
                    const offer = await peerRef.current?.createOffer();
                    await peerRef.current?.setLocalDescription(offer);
                    socketRef.current?.emit("offer", { offer, roomId });
                });

                socketRef.current?.on("offer", async ({ offer }) => {
                    setConnectionPhase("connected");
                    await peerRef.current?.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await peerRef.current?.createAnswer();
                    await peerRef.current?.setLocalDescription(answer);
                    socketRef.current?.emit("answer", { answer, roomId });
                });

                socketRef.current?.on("answer", ({ answer }) => {
                    peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
                });

                socketRef.current?.on("ice-candidate", ({ candidate }) => {
                    peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
                });

                // Peer left → back to waiting
                socketRef.current?.on("user-left", () => {
                    setConnectionPhase("waiting");
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
                });

                // Audio toggle sync
                socketRef.current?.on("user-audio-toggle", ({ isAudioEnabled }) => {
                    setPeerVolume(isAudioEnabled);
                });

                // --- Feature 3: Receive chat messages ---
                socketRef.current?.on("chat-message", ({ text, time }: { text: string; time: string }) => {
                    setMessages(prev => [...prev, { text, sender: "peer", time }]);
                    setUnreadCount(c => c + 1);
                });
            });

        return () => {
            socketRef.current?.emit("leave-room", roomId);
            peerRef.current?.close();
            socketRef.current?.disconnect();
        };
    }, [roomId]);

    // -----------------------------------------------------------------------
    // Controls
    // -----------------------------------------------------------------------
    const toggleMute = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        const newMuted = !isMuted;
        stream?.getAudioTracks().forEach(track => (track.enabled = !newMuted));
        setIsMuted(newMuted);
        socketRef.current?.emit("toggle-audio", { isAudioEnabled: !newMuted });
    };

    const toggleVideo = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        stream?.getVideoTracks().forEach(track => (track.enabled = !videoEnabled));
        setVideoEnabled(!videoEnabled);
    };

    // --- Feature 2: Copy full invite URL ---
    const copyInviteLink = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const leaveMeeting = () => {
        socketRef.current?.emit("leave-room", roomId);
        peerRef.current?.close();
        router.push("/");
    };

    // --- Feature 3: Send chat message ---
    const sendMessage = useCallback(() => {
        const text = chatInput.trim();
        if (!text || !socketRef.current) return;
        const time = nowTime();
        socketRef.current.emit("chat-message", { text, time });
        setMessages(prev => [...prev, { text, sender: "me", time }]);
        setChatInput("");
    }, [chatInput]);

    const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // --- Recording ---
    const startCanvasRecording = () => {
        const localVideo = localVideoRef.current;
        const remoteVideo = remoteVideoRef.current;
        if (!localVideo || !remoteVideo) return alert("Video not ready yet");

        startRecognition();

        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        canvasRef.current = canvas;

        const drawFrame = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, 1280, 720);
            ctx.drawImage(localVideo, 0, 0, 640, 720);
            ctx.drawImage(remoteVideo, 640, 0, 640, 720);
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(0, 680, 1280, 40);
            ctx.fillStyle = "white";
            ctx.font = "bold 24px Arial";
            ctx.textAlign = "center";
            ctx.fillText(subtitle, 640, 710);
            animationFrameRef.current = requestAnimationFrame(drawFrame);
        };

        drawFrame();

        const canvasStream = canvas.captureStream(30);
        const audioStream = new MediaStream();
        const localStream = localVideo.srcObject as MediaStream;
        const remoteStream = remoteVideo.srcObject as MediaStream;
        localStream.getAudioTracks().forEach(t => audioStream.addTrack(t));
        remoteStream?.getAudioTracks().forEach(t => audioStream.addTrack(t));

        const combinedStream = new MediaStream([...audioStream.getAudioTracks(), ...canvasStream.getVideoTracks()]);
        const mediaRecorder = new MediaRecorder(combinedStream, { mimeType: "video/webm;codecs=vp9,opus" });
        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        mediaRecorder.onstop = () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `nexus-rec-${Date.now()}.webm`;
            a.click();
        };

        mediaRecorder.start();
        setRecording(true);
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
        stopRecognition();
    };

    // -----------------------------------------------------------------------
    // Socket Status helpers
    // -----------------------------------------------------------------------
    const statusColor = socketStatus === "online" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
        : socketStatus === "connecting" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
            : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]";
    const statusLabel = socketStatus === "online" ? "ONLINE" : socketStatus === "connecting" ? "RECONNECTING..." : "OFFLINE";

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
        <div className="relative flex flex-col min-h-screen bg-slate-950 text-slate-100 overflow-hidden">
            {/* Ambient glows */}
            <div className="absolute top-[10%] left-[-15%] w-[45%] h-[45%] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[10%] right-[-15%] w-[45%] h-[45%] bg-cyan-600/10 blur-[150px] rounded-full pointer-events-none" />

            {/* ==================== HUD Top Bar ==================== */}
            <header className="z-20 flex-shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 mx-4 mt-4 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-[0_0_30px_-5px_rgba(0,0,0,0.5)]">
                {/* Left: status + room */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-800 border border-slate-700">
                        <span className={`w-3 h-3 rounded-full animate-pulse ${statusColor}`} />
                    </div>
                    <div>
                        <p className="text-xs font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 uppercase">
                            Nexus Uplink
                        </p>
                        <p className="text-xs text-slate-500 font-mono">
                            {statusLabel} &nbsp;·&nbsp; Room: <span className="text-slate-300">{roomId}</span>
                        </p>
                    </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 flex-wrap justify-center">
                    {recording && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-rose-500" /> REC
                        </div>
                    )}

                    {/* AV Controls */}
                    <button onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"} className={`p-2 rounded-lg border transition-all ${isMuted ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"}`}>
                        {isMuted ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        )}
                    </button>
                    <button onClick={toggleVideo} title={videoEnabled ? "Turn off camera" : "Turn on camera"} className={`p-2 rounded-lg border transition-all ${!videoEnabled ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"}`}>
                        {!videoEnabled ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                    </button>

                    {/* Feature 2: Share invite link */}
                    <button onClick={copyInviteLink} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${copied ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"}`}>
                        {copied ? (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>Copied!</>
                        ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>Share Link</>
                        )}
                    </button>

                    {/* Feature 3: Chat toggle */}
                    <button onClick={() => { setIsChatOpen(o => !o); setUnreadCount(0); }} className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                        Chat
                        {unreadCount > 0 && !isChatOpen && (
                            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold">{unreadCount}</span>
                        )}
                    </button>

                    {/* Record */}
                    {!recording ? (
                        <button onClick={startCanvasRecording} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            Record
                        </button>
                    ) : (
                        <button onClick={stopRecording} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold transition-all">
                            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> Stop Rec
                        </button>
                    )}

                    {/* Leave */}
                    <button onClick={leaveMeeting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-700/40 bg-rose-700/10 hover:bg-rose-700/20 text-rose-400 text-xs font-semibold transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Leave
                    </button>
                </div>
            </header>

            {/* ==================== Main Area ==================== */}
            <main className="z-10 flex flex-1 gap-4 p-4 overflow-hidden">

                {/* --- Video Area --- */}
                <div className="flex flex-col flex-1 gap-4 min-w-0">

                    {/* Feature 1: Waiting Room overlay on remote video */}
                    {connectionPhase === "waiting" ? (
                        /* Full-width waiting panel */
                        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-slate-900/60 border border-slate-700/40 gap-6">
                            {/* Local preview - small PiP */}
                            <div className="relative w-48 h-28 sm:w-64 sm:h-36 rounded-xl overflow-hidden border border-slate-600/50 shadow-lg bg-black">
                                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                <span className="absolute bottom-1 left-2 text-[10px] font-mono text-slate-400">LOCAL</span>
                            </div>
                            {/* Pulsing indicator */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative flex items-center justify-center">
                                    <span className="w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/30 animate-ping absolute" />
                                    <span className="w-10 h-10 rounded-full bg-blue-500/20 border-2 border-blue-400/60 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                    </span>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-slate-200">Waiting for peer to connect...</p>
                                    <p className="text-sm text-slate-500 mt-1">Share your invite link to get started</p>
                                </div>
                                <button onClick={copyInviteLink} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg ${copied ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50"}`}>
                                    {copied ? (
                                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>Link Copied!</>
                                    ) : (
                                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>Copy Invite Link</>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Connected: dual video grid */
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                            {/* Local Video */}
                            <div className="relative group rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/50 shadow-lg aspect-video">
                                <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none" />
                                <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2.5 py-1 bg-black/50 backdrop-blur-md border border-slate-700/80 rounded-full">
                                    <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Local // You</span>
                                    <span className={`ml-1 w-1.5 h-1.5 rounded-full ${isMuted ? "bg-rose-500" : "bg-emerald-400"}`} />
                                </div>
                                {!videoEnabled && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-slate-500 text-xs font-mono">VIDEO OFF</div>
                                )}
                                <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${videoEnabled ? "opacity-100" : "opacity-0"}`} />
                            </div>
                            {/* Remote Video */}
                            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/50 shadow-lg aspect-video">
                                <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none" />
                                <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2.5 py-1 bg-black/50 backdrop-blur-md border border-slate-700/80 rounded-full">
                                    <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Remote // Peer</span>
                                    <span className={`ml-1 w-1.5 h-1.5 rounded-full ${peerVolume ? "bg-cyan-400" : "bg-rose-500"}`} />
                                </div>
                                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-black" />
                            </div>
                        </div>
                    )}

                    {/* Subtitle ticker */}
                    {subtitle && (
                        <div className="px-4 py-2 bg-slate-900/60 border border-slate-700/40 rounded-xl text-center text-sm text-slate-300 font-medium tracking-wide">
                            {subtitle}
                        </div>
                    )}
                </div>

                {/* ==================== Feature 3: Chat Panel ==================== */}
                {isChatOpen && (
                    <aside className="z-10 flex flex-col w-72 lg:w-80 flex-shrink-0 bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
                        {/* Chat header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/50">
                            <p className="text-sm font-bold text-slate-200 tracking-wide">Session Chat</p>
                            <button onClick={() => setIsChatOpen(false)} className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs text-center gap-2 py-8">
                                    <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                    No messages yet.<br />Say hi to your peer!
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex flex-col gap-0.5 ${msg.sender === "me" ? "items-end" : "items-start"}`}>
                                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${msg.sender === "me" ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-700 text-slate-100 rounded-bl-sm"}`}>
                                        {msg.text}
                                    </div>
                                    <span className="text-[10px] text-slate-600 px-1">{msg.time}</span>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div className="flex items-center gap-2 p-3 border-t border-slate-700/50 bg-slate-800/50">
                            <input
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={handleChatKeyDown}
                                placeholder="Type a message..."
                                className="flex-1 bg-slate-700/60 border border-slate-600/50 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            />
                            <button onClick={sendMessage} disabled={!chatInput.trim()} className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-[0_0_12px_-3px_rgba(37,99,235,0.5)]">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            </button>
                        </div>
                    </aside>
                )}
            </main>

            {/* Footer sys info */}
            <div className="z-10 pb-3 text-center text-[10px] font-mono text-slate-700 tracking-widest">
                NEXUS // SECURE P2P UPLINK // {String(roomId).substring(0, 4).toUpperCase()}...
            </div>
        </div>
    );
}
