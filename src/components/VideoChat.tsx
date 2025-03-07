"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import io, { Socket } from "socket.io-client";

// 状态枚举常量
const CONNECTION_STATUS = {
    DISCONNECTED: "未连接",
    WAITING: "等待呼叫",
    RINGING: "正在呼叫...",
    ACTIVE: "通话中",
    ENDED: "已结束通话",
    ERROR: "连接错误",
} as const;

const VideoChat = () => {
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<keyof typeof CONNECTION_STATUS>("DISCONNECTED");

    const streamRef = useRef<MediaStream | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    // 清理通话资源
    const cleanupCall = useCallback(() => {
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;

        // 清理远程视频
        if (remoteVideoRef.current?.srcObject) {
            (remoteVideoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            remoteVideoRef.current.srcObject = null;
        }
        // 将发起呼叫的按钮设置为可点击
        setConnectionStatus("WAITING");
    }, []);
    // 处理呼叫结束
    const handleCallEnded = useCallback(() => {
        cleanupCall();
        socketRef.current?.emit("call-ended");
    }, [cleanupCall]);

    // 创建对等连接
    const createPeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                // 可添加更多 TURN 服务器（生产环境需要）
            ],
        });

        pc.onicecandidate = event => {
            if (event.candidate) {
                socketRef.current?.emit("ice-candidate", event.candidate);
            }
        };

        pc.ontrack = event => {
            if (remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected") {
                handleCallEnded();
            }
        };

        // 添加本地媒体轨道
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, streamRef.current!);
            });
        }

        return pc;
    }, [handleCallEnded]);

    // 处理媒体错误
    const handleMediaError = useCallback((error: Error) => {
        console.error("媒体设备错误:", error);
        setConnectionStatus("ERROR");
    }, []);

    useEffect(() => {
        const socket = io("http://localhost:3001");
        socketRef.current = socket;

        // Socket 事件处理
        const handleOffer = async (offer: RTCSessionDescriptionInit) => {
            setConnectionStatus("RINGING");
            try {
                if (!peerConnectionRef.current) {
                    peerConnectionRef.current = createPeerConnection();
                }
                await peerConnectionRef.current.setRemoteDescription(offer);
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                socket.emit("answer", answer);
                setConnectionStatus("ACTIVE");
            } catch (error) {
                handleMediaError(error as Error);
            }
        };

        const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(answer);
                setConnectionStatus("ACTIVE");
            }
        };

        const handleIceCandidate = async (candidate: RTCIceCandidate) => {
            if (peerConnectionRef.current) {
                try {
                    await peerConnectionRef.current.addIceCandidate(candidate);
                } catch (error) {
                    console.error("添加 ICE 候选失败:", error);
                }
            }
        };

        // 添加 handleCallEnded 到依赖数组
        socket
            .on("connect", () => setConnectionStatus("WAITING"))
            .on("call-ended", handleCallEnded)
            .on("offer", handleOffer)
            .on("answer", handleAnswer)
            .on("ice-candidate", handleIceCandidate);

        // 获取本地媒体流
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then(stream => {
                streamRef.current = stream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
            })
            .catch(handleMediaError);

        // 清理函数
        return () => {
            socket.off("call-ended", handleCallEnded);
            socket.off("offer", handleOffer);
            socket.off("answer", handleAnswer);
            socket.off("ice-candidate", handleIceCandidate);
            socket.disconnect();
            cleanupCall();
            streamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, [createPeerConnection, handleCallEnded, handleMediaError, cleanupCall]);

    // 媒体控制
    const toggleMedia = useCallback((kind: "audio" | "video") => {
        if (!streamRef.current) return;

        const tracks = kind === "audio" ? streamRef.current.getAudioTracks() : streamRef.current.getVideoTracks();

        tracks.forEach(track => {
            track.enabled = !track.enabled;
            if (kind === "audio") setIsAudioEnabled(track.enabled);
            if (kind === "video") setIsVideoEnabled(track.enabled);
        });
    }, []);

    // 发起呼叫
    const startCall = useCallback(async () => {
        try {
            peerConnectionRef.current = createPeerConnection();
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            socketRef.current?.emit("offer", offer);
            setConnectionStatus("RINGING");
        } catch (error) {
            handleMediaError(error as Error);
        }
    }, [createPeerConnection, handleMediaError]);

    return (
        <div className="flex flex-col items-center gap-6 p-4 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800">WebRTC 会议室</h1>
            <div className="text-sm font-medium px-4 py-2 rounded-full bg-gray-100 text-gray-700">{CONNECTION_STATUS[connectionStatus]}</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                {/* 本地视频 */}
                <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-gray-900" />
                    <div className="absolute bottom-2 left-2 text-sm text-white bg-black/50 px-2 py-1 rounded">你</div>
                </div>

                {/* 远程视频 */}
                <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg">
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-gray-900" />
                    <div className="absolute bottom-2 left-2 text-sm text-white bg-black/50 px-2 py-1 rounded">对方</div>
                </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex flex-wrap gap-4 justify-center">
                <button
                    onClick={() => toggleMedia("audio")}
                    className={`px-6 py-3 rounded-full font-medium transition-colors ${
                        isAudioEnabled ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"
                    } text-white`}
                >
                    {isAudioEnabled ? "关闭麦克风" : "开启麦克风"}
                </button>

                <button
                    onClick={() => toggleMedia("video")}
                    className={`px-6 py-3 rounded-full font-medium transition-colors ${
                        isVideoEnabled ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"
                    } text-white`}
                >
                    {isVideoEnabled ? "关闭摄像头" : "开启摄像头"}
                </button>

                <button
                    onClick={startCall}
                    disabled={connectionStatus !== "WAITING"}
                    className="px-6 py-3 rounded-full font-medium bg-green-500 hover:bg-green-600 disabled:bg-gray-400 transition-colors text-white"
                >
                    发起呼叫
                </button>

                <button
                    onClick={handleCallEnded}
                    disabled={!peerConnectionRef.current}
                    className="px-6 py-3 rounded-full font-medium bg-red-500 hover:bg-red-600 disabled:bg-gray-400 transition-colors text-white"
                >
                    结束通话
                </button>
            </div>
        </div>
    );
};

export default VideoChat;
