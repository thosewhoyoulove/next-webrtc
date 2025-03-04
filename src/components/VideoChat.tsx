"use client";
import { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
const VideoChat = () => {
    // ... existing code ...
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState("未连接");
    const streamRef = useRef<MediaStream | null>(null);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const socket = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        socket.current = io("http://localhost:3001");

        socket.current.on("connect", () => {
            console.log("连接成功");
            setConnectionStatus("等待呼叫");
        });
        //这段代码没有运行
        socket.current?.on("call-ended", () => {
            console.log("call-ended");
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
            }
            setConnectionStatus("对方已结束通话");
        });
        socket.current.on("offer", async (offer: RTCSessionDescriptionInit) => {
            setConnectionStatus("收到呼叫请求...");
            if (!peerConnectionRef.current) {
                peerConnectionRef.current = createPeerConnection();
            }
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            socket.current?.emit("answer", answer);
            setConnectionStatus("通话中");
        });

        socket.current.on("answer", async (answer: RTCSessionDescriptionInit) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
                setConnectionStatus("通话中");
            }
        });

        socket.current.on("ice-candidate", async (candidate: RTCIceCandidate) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        const currentPeerConnection = peerConnectionRef.current; // 保存引用
        const currentStream = streamRef.current; // 保存引用

        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then(stream => {
                streamRef.current = stream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
                // ... existing socket setup code ...
            })
            .catch(error => {
                console.error("获取媒体设备失败:", error);
                setConnectionStatus("无法访问摄像头或麦克风");
            });

        return () => {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            if (currentPeerConnection) {
                currentPeerConnection.close();
            }
            socket.current?.disconnect();
        };
    }, []);

    const toggleAudio = () => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !isAudioEnabled;
                setIsAudioEnabled(!isAudioEnabled);
            }
        }
    };

    const toggleVideo = () => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !isVideoEnabled;
                setIsVideoEnabled(!isVideoEnabled);
            }
        }
    };

    // 添加创建连接的函数
    const createPeerConnection = () => {
        const configuration: RTCConfiguration = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        };

        const pc = new RTCPeerConnection(configuration);

        pc.onicecandidate = event => {
            if (event.candidate) {
                socket.current?.emit("ice-candidate", event.candidate);
            }
        };

        pc.ontrack = event => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        // 添加本地流到对等连接
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                if (streamRef.current) {
                    pc.addTrack(track, streamRef.current);
                }
            });
        }

        return pc;
    };

    // 添加发起呼叫的函数
    const startCall = async () => {
        try {
            peerConnectionRef.current = createPeerConnection();
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            socket.current?.emit("offer", offer);
            setConnectionStatus("正在呼叫...");
        } catch (error) {
            console.error("发起呼叫失败:", error);
            setConnectionStatus("呼叫失败");
        }
    };

    const endCall = () => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        setConnectionStatus("等待呼叫");
        socket.current?.emit("call-ended");
        console.log("endCall");
    };

    return (
        <div className="flex flex-col items-center gap-6 p-4 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800">WebRTC 会议室</h1>
            <div className="text-sm font-medium px-4 py-2 rounded-full bg-gray-100 text-gray-700">{connectionStatus}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-gray-900"></video>
                    <div className="absolute bottom-2 left-2 text-sm text-white bg-black/50 px-2 py-1 rounded">你</div>
                </div>
                <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg">
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-gray-900"></video>
                    <div className="absolute bottom-2 left-2 text-sm text-white bg-black/50 px-2 py-1 rounded">对方</div>
                </div>
            </div>
            <div className="flex flex-wrap gap-4 justify-center">
                <button
                    onClick={toggleAudio}
                    className={`px-6 py-3 rounded-full font-medium transition-colors
                        ${isAudioEnabled ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"} text-white`}
                >
                    {isAudioEnabled ? "关闭麦克风" : "开启麦克风"}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`px-6 py-3 rounded-full font-medium transition-colors
                        ${isVideoEnabled ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"} text-white`}
                >
                    {isVideoEnabled ? "关闭摄像头" : "开启摄像头"}
                </button>
                <button onClick={startCall} className="px-6 py-3 rounded-full font-medium bg-green-500 hover:bg-green-600 transition-colors text-white">
                    发起呼叫
                </button>
                <button onClick={endCall} className="px-6 py-3 rounded-full font-medium bg-red-500 hover:bg-red-600 transition-colors text-white">
                    结束通话
                </button>
            </div>
        </div>
    );
};

export default VideoChat;
