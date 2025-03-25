"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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

// WebRTC配置
const RTC_CONFIG = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "turn:43.139.104.70:3478", username: "ubuntu", credential: ".8gAS|]#bkh5Vf" }],
};

// 服务器URL
const SERVER_URL = "http://localhost:3001";

const VideoChat = () => {
    // 状态管理
    const [mediaState, setMediaState] = useState({
        isAudioEnabled: true,
        isVideoEnabled: true,
    });
    const [connectionStatus, setConnectionStatus] = useState<keyof typeof CONNECTION_STATUS>("DISCONNECTED");
    const [roomState, setRoomState] = useState({
        inviteCode: "",
        roomId: null as string | null,
    });
    const [isHost, setIsHost] = useState(false); // 新增字段，用于判断是否是主持人

    // Refs
    const streamRef = useRef<MediaStream | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    // 从状态解构变量，提高可读性
    const { isAudioEnabled, isVideoEnabled } = mediaState;
    const { inviteCode, roomId } = roomState;

    // 清理通话资源
    const cleanupCall = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // 清理远程视频
        if (remoteVideoRef.current?.srcObject) {
            const remoteStream = remoteVideoRef.current.srcObject as MediaStream;
            remoteStream.getTracks().forEach(track => track.stop());
            remoteVideoRef.current.srcObject = null;
        }

        setConnectionStatus("WAITING");
    }, []);

    // 处理呼叫结束
    const handleCallEnded = useCallback(() => {
        cleanupCall();
        socketRef.current?.emit("call-ended");
    }, [cleanupCall]);

    // 处理媒体错误
    const handleMediaError = useCallback((error: Error) => {
        console.error("媒体设备错误:", error);
        setConnectionStatus("ERROR");
    }, []);

    // 创建对等连接
    const createPeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(RTC_CONFIG);

        pc.onicecandidate = event => {
            if (event.candidate) {
                socketRef.current?.emit("ice-candidate", event.candidate, inviteCode);
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
                if (streamRef.current) {
                    pc.addTrack(track, streamRef.current);
                }
            });
        }

        return pc;
    }, [handleCallEnded, inviteCode]);

    // 发起呼叫
    const startCall = useCallback(async () => {
        if (!streamRef.current) {
            alert("无法访问媒体设备");
            return;
        }

        console.log("发起呼叫开始");
        try {
            peerConnectionRef.current = createPeerConnection();
            console.log("创建PeerConnection");

            const offer = await peerConnectionRef.current.createOffer();
            console.log("创建Offer:", offer);

            await peerConnectionRef.current.setLocalDescription(offer);
            console.log("设置本地描述");
            socketRef.current?.emit("offer", offer, inviteCode);
            console.log("发送Offer");
            setConnectionStatus("RINGING");
        } catch (error) {
            console.error("发起呼叫失败:", error);
            handleMediaError(error as Error);
        }
    }, [createPeerConnection, handleMediaError, inviteCode]);

    // Socket 事件处理程序
    const socketHandlers = useMemo(
        () => ({
            handleOffer: async (offer: RTCSessionDescriptionInit) => {
                console.log(offer, "处理Offer");
                setConnectionStatus("RINGING");
                try {
                    if (!peerConnectionRef.current) {
                        peerConnectionRef.current = createPeerConnection();
                    }
                    await peerConnectionRef.current.setRemoteDescription(offer);
                    const answer = await peerConnectionRef.current.createAnswer();
                    console.log("创建Answer:", answer);
                    try {
                        await peerConnectionRef.current.setLocalDescription(answer);
                        socketRef.current?.emit("answer", answer, inviteCode);
                        setConnectionStatus("ACTIVE");
                    } catch (error) {
                        console.error("设置本地描述失败:", error);
                        handleMediaError(error as Error);
                    }
                } catch (error) {
                    handleMediaError(error as Error);
                }
            },

            handleAnswer: async (answer: RTCSessionDescriptionInit) => {
                console.log(answer, "设置远程描述");
                if (peerConnectionRef.current) {
                    console.log("设置远程描述");
                    await peerConnectionRef.current.setRemoteDescription(answer);
                    setConnectionStatus("ACTIVE");
                }
            },

            handleIceCandidate: async (candidate: RTCIceCandidate) => {
                console.log(candidate, "添加 ICE 候选");
                if (peerConnectionRef.current) {
                    console.log("添加 ICE 候选");
                    try {
                        await peerConnectionRef.current.addIceCandidate(candidate);
                    } catch (error) {
                        console.error("添加 ICE 候选失败:", error);
                    }
                }
            },

            handleRoomCreated: (newInviteCode: string) => {
                setRoomState(prev => ({ ...prev, inviteCode: newInviteCode }));
                alert(`房间创建成功，邀请码: ${newInviteCode}`);
                setIsHost(true); // 设置为主持人
            },

            handleUserJoined: (userId: string) => {
                // 更新连接状态
                startCall();
                console.log("有新用户加入房间: ", userId);
            },
        }),
        [createPeerConnection, handleMediaError, startCall, inviteCode]
    );

    // 初始化 Socket 连接和媒体设备
    useEffect(() => {
        // 创建 Socket 连接
        const socket = io(SERVER_URL);
        socketRef.current = socket;

        // 设置 Socket 事件监听器
        socket.on("connect", () => setConnectionStatus("WAITING"));
        socket.on("call-ended", handleCallEnded);
        socket.on("offer", socketHandlers.handleOffer);
        socket.on("answer", socketHandlers.handleAnswer);
        socket.on("ice-candidate", socketHandlers.handleIceCandidate);
        socket.on("room-created", socketHandlers.handleRoomCreated);
        socket.on("user-joined", socketHandlers.handleUserJoined);

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
            // 移除所有事件监听器
            socket.offAny();
            socket.disconnect();

            // 停止所有媒体轨道
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            cleanupCall();
        };
    }, [socketHandlers, handleCallEnded, handleMediaError, cleanupCall]);

    // 切换媒体(音频/视频)
    const toggleMedia = useCallback((kind: "audio" | "video") => {
        if (!streamRef.current) return;

        const tracks = kind === "audio" ? streamRef.current.getAudioTracks() : streamRef.current.getVideoTracks();

        tracks.forEach(track => {
            track.enabled = !track.enabled;
        });

        setMediaState(prev => ({
            ...prev,
            [kind === "audio" ? "isAudioEnabled" : "isVideoEnabled"]: tracks[0]?.enabled ?? false,
        }));
    }, []);

    // 房间管理函数
    const roomActions = useMemo(
        () => ({
            createRoom: () => {
                socketRef.current?.emit("create-room", inviteCode);
            },

            joinRoom: () => {
                if (!inviteCode.trim()) {
                    alert("请输入有效的邀请码");
                    return;
                }

                socketRef.current?.emit("join-room", inviteCode);
                setRoomState(prev => ({ ...prev, roomId: inviteCode }));
                setConnectionStatus("WAITING");
            },

            updateInviteCode: (code: string) => {
                setRoomState(prev => ({ ...prev, inviteCode: code }));
            },
        }),
        [inviteCode]
    );

    // 渲染按钮样式辅助函数
    const buttonClass = useCallback((isEnabled: boolean, color: "blue" | "red" | "green") => {
        const baseClass = "px-6 py-3 rounded-full font-medium transition-colors text-white ";
        const colors = {
            blue: isEnabled ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600",
            red: "bg-red-500 hover:bg-red-600 disabled:bg-gray-400",
            green: "bg-green-500 hover:bg-green-600 disabled:bg-gray-400",
        };

        return baseClass + colors[color];
    }, []);

    return (
        <div className="flex flex-col items-center gap-6 p-4 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800">WebRTC 会议室</h1>

            {/* 状态显示 */}
            <div className="text-sm font-medium px-4 py-2 rounded-full bg-gray-100 text-gray-700">{CONNECTION_STATUS[connectionStatus]}</div>

            {/* 房间管理 */}
            {inviteCode ? (
                <p>您的邀请码是：{inviteCode}</p>
            ) : (
                <div className="flex gap-2">
                    <button onClick={roomActions.createRoom} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                        创建房间
                    </button>
                </div>
            )}

            {/* 当前房间状态 */}
            {roomId && <div className="text-sm font-medium px-4 py-2 rounded-full bg-gray-100 text-gray-700">已加入房间: {roomId}</div>}

            {/* 邀请码输入 */}
            {!roomId && (
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                    <input
                        type="text"
                        value={inviteCode}
                        onChange={e => roomActions.updateInviteCode(e.target.value)}
                        className="px-4 py-2 border rounded-md"
                        placeholder="请输入邀请码"
                    />
                    <button onClick={roomActions.joinRoom} disabled={!inviteCode.trim()} className={buttonClass(true, "green")}>
                        加入房间
                    </button>
                </div>
            )}

            {/* 主持人控制面板 */}
            {isHost && (
                <div className="flex gap-6 mt-4">
                    <button onClick={startCall} className={buttonClass(true, "blue")}>
                        发起呼叫
                    </button>
                    <button onClick={handleCallEnded} className={buttonClass(false, "red")}>
                        结束通话
                    </button>
                </div>
            )}

            {/* 视频画面 */}
            <div className="flex gap-4 mt-6">
                <div>
                    <h3>本地视频</h3>
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-64 h-64 rounded-lg bg-black" />
                </div>

                <div>
                    <h3>远程视频</h3>
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-64 h-64 rounded-lg bg-black" />
                </div>
            </div>

            {/* 音视频切换 */}
            <div className="flex gap-4 mt-6">
                <button onClick={() => toggleMedia("audio")} className={buttonClass(isAudioEnabled, "blue")}>
                    {isAudioEnabled ? "关闭音频" : "开启音频"}
                </button>
                <button onClick={() => toggleMedia("video")} className={buttonClass(isVideoEnabled, "blue")}>
                    {isVideoEnabled ? "关闭视频" : "开启视频"}
                </button>
            </div>
        </div>
    );
};

export default VideoChat;
