// src/components/RoomContent.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import io, { Socket } from "socket.io-client";
import { useSubtitleRecognizer } from "@/hooks/useSubtitleRecognizer";

export default function RoomContent() {
    const router = useRouter();
    const { id: roomId } = router.query;

    // 视频相关的 ref
    const localVideoRef = useRef<HTMLVideoElement>(null); // 本地视频元素引用
    const remoteVideoRef = useRef<HTMLVideoElement>(null); // 远程视频元素引用

    // WebRTC 相关的 ref
    const socketRef = useRef<Socket | null>(null); // Socket.io 连接引用
    const peerRef = useRef<RTCPeerConnection | null>(null); // WebRTC 连接引用

    // UI 状态管理
    const [isMuted, setIsMuted] = useState(false); // 静音状态
    const [videoEnabled, setVideoEnabled] = useState(true); // 视频开启状态
    const [peerLeft, setPeerLeft] = useState(false); // 对方是否离开
    const [recording, setRecording] = useState(false); // 录制状态

    // 录制相关的 ref
    const mediaRecorderRef = useRef<MediaRecorder | null>(null); // 媒体录制器引用
    const recordedChunksRef = useRef<Blob[]>([]); // 录制的数据块
    const canvasRef = useRef<HTMLCanvasElement | null>(null); // 画布引用
    const animationFrameRef = useRef<number | undefined>(undefined); // 动画帧引用

    // 语音识别 Hook
    const { subtitle, startRecognition, stopRecognition } = useSubtitleRecognizer("zh-CN");
    //获取对方的音量是否开关
    const [peerVolume, setPeerVolume] = useState(true);
    // 核心的 WebRTC 连接逻辑
    useEffect(() => {
        if (!roomId) return;
        // 保存最近的房间ID
        localStorage.setItem("lastRoomId", roomId as string);

        // 连接信令服务器
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "https://webrtc.peterroe.me/";
        socketRef.current = io(socketUrl);
        // socketRef.current = io();
        // 获取本地媒体流
        navigator.mediaDevices
            .getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                },
                audio: true,
            })
            .then(stream => {
                // 设置本地视频流
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;

                // 创建 WebRTC 连接
                peerRef.current = new RTCPeerConnection();
                // 添加本地媒体轨道到连接中
                stream.getTracks().forEach(track => peerRef.current?.addTrack(track, stream));

                // 处理远程视频流
                peerRef.current.ontrack = event => {
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
                };

                // ICE 候选处理
                peerRef.current.onicecandidate = event => {
                    if (event.candidate) socketRef.current?.emit("ice-candidate", { candidate: event.candidate, roomId });
                };

                // 加入房间
                socketRef.current?.emit("join-room", roomId);

                // 处理新用户加入
                socketRef.current?.on("user-joined", async () => {
                    const offer = await peerRef.current?.createOffer();
                    await peerRef.current?.setLocalDescription(offer);
                    socketRef.current?.emit("offer", { offer, roomId });
                });

                // 处理收到的 offer
                socketRef.current?.on("offer", async ({ offer }) => {
                    await peerRef.current?.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await peerRef.current?.createAnswer();
                    await peerRef.current?.setLocalDescription(answer);
                    socketRef.current?.emit("answer", { answer, roomId });
                });

                // 处理收到的 answer
                socketRef.current?.on("answer", ({ answer }) => {
                    peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
                });

                // 处理 ICE 候选
                socketRef.current?.on("ice-candidate", ({ candidate }) => {
                    peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
                });

                // 处理用户离开
                socketRef.current?.on("user-left", () => {
                    setPeerLeft(true);
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = null;
                    }
                });

                // 监听对方的音频状态变化
                socketRef.current?.on("user-audio-toggle", ({ isAudioEnabled }) => {
                    setPeerVolume(isAudioEnabled);
                });
            });

        // 清理函数
        return () => {
            socketRef.current?.emit("leave-room", roomId);
            peerRef.current?.close();
        };
    }, [roomId]);

    // 音频控制：切换静音状态
    const toggleMute = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        const newMuted = !isMuted;
        // 设置本地音轨状态
        stream?.getAudioTracks().forEach(track => (track.enabled = !newMuted));
        // 更新本地静音状态
        setIsMuted(newMuted);
        // 通知其他用户音频状态变化
        socketRef.current?.emit("toggle-audio", { isAudioEnabled: !newMuted });
    };

    // 视频控制：切换视频开启状态
    const toggleVideo = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        stream?.getVideoTracks().forEach(track => (track.enabled = !videoEnabled));
        setVideoEnabled(!videoEnabled);
    };

    // 复制房间ID到剪贴板
    const copyToClipboard = () => {
        if (roomId) {
            navigator.clipboard.writeText(roomId as string).then(() => {
                alert("房间 ID 已复制到剪贴板！");
            });
        }
    };

    // 离开会议
    const leaveMeeting = () => {
        socketRef.current?.emit("leave-room", roomId);
        peerRef.current?.close();
        router.push("/");
    };

    // 开始录制会议
    const startCanvasRecording = () => {
        const localVideo = localVideoRef.current;
        const remoteVideo = remoteVideoRef.current;
        if (!localVideo || !remoteVideo) return alert("视频还没准备好");

        // 开始语音识别
        startRecognition();

        // 创建画布用于合成视频
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        canvasRef.current = canvas;

        // 定义每一帧的绘制函数
        const drawFrame = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, 1280, 720);

            // 绘制本地和远程视频
            ctx.drawImage(localVideo, 0, 0, 640, 720);
            ctx.drawImage(remoteVideo, 640, 0, 640, 720);

            // 添加字幕背景
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 680, 1280, 40);

            // 绘制字幕
            ctx.fillStyle = "white";
            ctx.font = "bold 24px Arial";
            ctx.textAlign = "center";
            ctx.fillText(subtitle, 640, 710);

            // 请求下一帧
            animationFrameRef.current = requestAnimationFrame(drawFrame);
        };

        drawFrame();

        // 从画布创建视频流
        const canvasStream = canvas.captureStream(30);

        // 创建音频流
        const audioStream = new MediaStream();
        const localStream = localVideo.srcObject as MediaStream;
        const remoteStream = remoteVideo.srcObject as MediaStream;

        // 合并本地和远程的音频轨道
        localStream.getAudioTracks().forEach(track => audioStream.addTrack(track));
        remoteStream.getAudioTracks().forEach(track => audioStream.addTrack(track));

        // 创建最终的媒体流（音频+视频）
        const combinedStream = new MediaStream([...audioStream.getAudioTracks(), ...canvasStream.getVideoTracks()]);

        // 配置媒体录制器
        const mediaRecorder = new MediaRecorder(combinedStream, {
            mimeType: "video/webm;codecs=vp9,opus",
        });

        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        // 处理录制数据
        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) recordedChunksRef.current.push(event.data);
        };

        // 录制结束时的处理
        mediaRecorder.onstop = () => {
            cancelAnimationFrame(animationFrameRef.current!);
            const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `recording-${Date.now()}.webm`;
            a.click();
        };

        // 开始录制
        mediaRecorder.start();
        setRecording(true);
    };

    // 停止录制
    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
        stopRecognition();
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white px-4 py-8">
            {/* 对方离开提示 */}
            <h1 className="mb-4 text-center">{peerLeft && <p className="text-red-500">The other user has left the meeting.</p>}</h1>

            {/* 房间信息区域 */}
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 w-full max-w-3xl justify-center text-center sm:text-left">
                <h1 className="font-bold text-xl sm:text-2xl break-words">Room ID: {roomId}</h1>
                <button onClick={copyToClipboard} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto">
                    Copy Room ID
                </button>
            </div>

            {/* 视频显示区域 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-4xl">
                {/* 本地视频 */}
                <div className="relative border-2 border-gray-700 rounded-lg overflow-hidden">
                    <p className="absolute top-2 left-2 bg-gray-700 px-2 py-1 text-sm rounded">You {isMuted ? "🔇" : "🔊"}</p>
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-64 sm:h-72 bg-black" />
                </div>
                {/* 远程视频 */}
                <div className="relative border-2 border-gray-700 rounded-lg overflow-hidden">
                    <p className="absolute top-2 left-2 bg-gray-700 px-2 py-1 text-sm rounded">Peer {peerVolume ? "🔊" : "🔇"}</p>
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-64 sm:h-72 bg-black" />
                </div>
            </div>

            {/* 控制按钮区域 */}
            <div className="flex flex-col justify-center sm:flex-row gap-4 mt-6 w-full max-w-4xl">
                <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto" onClick={toggleMute}>
                    {isMuted ? "Unmute" : "Mute"}
                </button>
                <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto" onClick={toggleVideo}>
                    {videoEnabled ? "Turn Off Video" : "Turn On Video"}
                </button>
                <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto" onClick={leaveMeeting}>
                    Leave Meeting
                </button>
                {!recording ? (
                    <button className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto" onClick={startCanvasRecording}>
                        Record
                    </button>
                ) : (
                    <button className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto" onClick={stopRecording}>
                        Stop Recording
                    </button>
                )}
            </div>
        </div>
    );
}
