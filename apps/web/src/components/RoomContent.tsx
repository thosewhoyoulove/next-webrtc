// src/components/RoomContent.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import io, { Socket } from "socket.io-client";
import { useSubtitleRecognizer } from "@/hooks/useSubtitleRecognizer";

// 日志工具
const logger = {
    info: (message: string, data?: any) => {
        console.log(`[WebRTC-Info] ${message}`, data || '');
    },
    error: (message: string, error?: any) => {
        console.error(`[WebRTC-Error] ${message}`, error || '');
    },
    warn: (message: string, data?: any) => {
        console.warn(`[WebRTC-Warn] ${message}`, data || '');
    }
};

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
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting'); // 连接状态
    const [copied, setCopied] = useState(false); // 复制状态

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
        
        logger.info(`初始化房间 ${roomId}`);
        // 保存最近的房间ID
        localStorage.setItem("lastRoomId", roomId as string);

        // 连接信令服务器
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "https://webrtc.peterroe.me/";
        logger.info(`连接Socket服务器: ${socketUrl}`);
        
        socketRef.current = io(socketUrl);
        
        socketRef.current.on('connect', () => {
            logger.info('Socket连接成功');
            setConnectionStatus('connected');
        });
        
        socketRef.current.on('disconnect', () => {
            logger.warn('Socket连接断开');
            setConnectionStatus('disconnected');
        });
        
        // socketRef.current = io();
        // 获取本地媒体流
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            logger.error('浏览器不支持媒体设备访问');
            alert("无法访问媒体设备。请确保您使用 HTTPS 协议或 localhost 访问，并且浏览器支持 WebRTC。");
            return;
        }

        logger.info('请求本地媒体流');
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
                logger.info('本地媒体流获取成功', { 
                    videoTracks: stream.getVideoTracks().length,
                    audioTracks: stream.getAudioTracks().length 
                });
                
                // 设置本地视频流
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;

                // 创建 WebRTC 连接
                logger.info('创建RTCPeerConnection');
                peerRef.current = new RTCPeerConnection();
                
                // 添加本地媒体轨道到连接中
                stream.getTracks().forEach(track => {
                    logger.info(`添加本地轨道: ${track.kind}`);
                    peerRef.current?.addTrack(track, stream);
                });

                // 处理远程视频流
                peerRef.current.ontrack = event => {
                    logger.info('收到远程视频流', { streams: event.streams.length });
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
                };

                // ICE 候选处理
                peerRef.current.onicecandidate = event => {
                    if (event.candidate) {
                        logger.info('发送ICE候选', { candidate: event.candidate.candidate });
                        socketRef.current?.emit("ice-candidate", { candidate: event.candidate, roomId });
                    }
                };

                // WebRTC连接状态监控
                peerRef.current.onconnectionstatechange = () => {
                    const state = peerRef.current?.connectionState;
                    logger.info('WebRTC连接状态变化', { state });
                    if (state === 'connected') {
                        setPeerLeft(false);
                    } else if (state === 'disconnected' || state === 'failed') {
                        setPeerLeft(true);
                    }
                };

                // 加入房间
                logger.info(`加入房间: ${roomId}`);
                socketRef.current?.emit("join-room", roomId);

                // 处理新用户加入
                socketRef.current?.on("user-joined", async () => {
                    logger.info('检测到新用户加入，开始创建offer');
                    try {
                        const offer = await peerRef.current?.createOffer();
                        await peerRef.current?.setLocalDescription(offer);
                        logger.info('发送offer');
                        socketRef.current?.emit("offer", { offer, roomId });
                    } catch (error) {
                        logger.error('创建offer失败', error);
                    }
                });

                // 处理收到的 offer
                socketRef.current?.on("offer", async ({ offer }) => {
                    logger.info('收到offer，开始创建answer');
                    try {
                        await peerRef.current?.setRemoteDescription(new RTCSessionDescription(offer));
                        const answer = await peerRef.current?.createAnswer();
                        await peerRef.current?.setLocalDescription(answer);
                        logger.info('发送answer');
                        socketRef.current?.emit("answer", { answer, roomId });
                    } catch (error) {
                        logger.error('处理offer失败', error);
                    }
                });

                // 处理收到的 answer
                socketRef.current?.on("answer", ({ answer }) => {
                    logger.info('收到answer');
                    try {
                        peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
                    } catch (error) {
                        logger.error('处理answer失败', error);
                    }
                });

                // 处理 ICE 候选
                socketRef.current?.on("ice-candidate", ({ candidate }) => {
                    logger.info('收到ICE候选');
                    try {
                        peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (error) {
                        logger.error('添加ICE候选失败', error);
                    }
                });

                // 处理用户离开
                socketRef.current?.on("user-left", () => {
                    logger.warn('对方用户离开');
                    setPeerLeft(true);
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = null;
                    }
                });

                // 监听对方的音频状态变化
                socketRef.current?.on("user-audio-toggle", ({ isAudioEnabled }) => {
                    logger.info('对方音频状态变化', { isAudioEnabled });
                    setPeerVolume(isAudioEnabled);
                });
            })
            .catch(error => {
                logger.error('获取本地媒体流失败', error);
                alert('无法访问摄像头和麦克风，请检查权限设置');
            });

        // 清理函数
        return () => {
            logger.info('清理资源，离开房间');
            socketRef.current?.emit("leave-room", roomId);
            peerRef.current?.close();
        };
    }, [roomId]);

    // 音频控制：切换静音状态
    const toggleMute = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        const newMuted = !isMuted;
        
        logger.info(`切换音频状态: ${newMuted ? '静音' : '取消静音'}`);
        
        // 设置本地音轨状态
        stream?.getAudioTracks().forEach(track => {
            track.enabled = !newMuted;
            logger.info(`音频轨道状态: ${track.enabled ? '开启' : '关闭'}`);
        });
        
        // 更新本地静音状态
        setIsMuted(newMuted);
        // 通知其他用户音频状态变化
        socketRef.current?.emit("toggle-audio", { isAudioEnabled: !newMuted });
    };

    // 视频控制：切换视频开启状态
    const toggleVideo = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        const newVideoEnabled = !videoEnabled;
        
        logger.info(`切换视频状态: ${newVideoEnabled ? '开启' : '关闭'}`);
        
        stream?.getVideoTracks().forEach(track => {
            track.enabled = newVideoEnabled;
            logger.info(`视频轨道状态: ${track.enabled ? '开启' : '关闭'}`);
        });
        
        setVideoEnabled(newVideoEnabled);
    };

    // 复制房间ID到剪贴板
    const copyToClipboard = async () => {
        if (roomId) {
            try {
                await navigator.clipboard.writeText(roomId as string);
                setCopied(true);
                logger.info('房间ID已复制到剪贴板');
                setTimeout(() => setCopied(false), 2000);
            } catch (error) {
                logger.error('复制失败', error);
                // 降级方案
                const textArea = document.createElement('textarea');
                textArea.value = roomId as string;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        }
    };

    // 离开会议
    const leaveMeeting = () => {
        logger.info('用户主动离开会议');
        socketRef.current?.emit("leave-room", roomId);
        peerRef.current?.close();
        router.push("/");
    };

    // 开始录制会议
    const startCanvasRecording = () => {
        const localVideo = localVideoRef.current;
        const remoteVideo = remoteVideoRef.current;
        if (!localVideo || !remoteVideo) {
            logger.warn('视频未准备好，无法开始录制');
            return alert("视频还没准备好");
        }

        logger.info('开始录制会议');
        
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
        logger.info('录制已开始');
    };

    // 停止录制
    const stopRecording = () => {
        logger.info('停止录制');
        mediaRecorderRef.current?.stop();
        setRecording(false);
        stopRecognition();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
            {/* 头部状态栏 */}
            <div className="sticky top-0 z-50 bg-black/30 backdrop-blur-md border-b border-white/10">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        {/* 连接状态指示器 */}
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full animate-pulse ${
                                connectionStatus === 'connected' ? 'bg-green-400' :
                                connectionStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'
                            }`} />
                            <span className="text-xs text-gray-300">
                                {connectionStatus === 'connected' ? '已连接' :
                                 connectionStatus === 'connecting' ? '连接中...' : '连接断开'}
                            </span>
                        </div>
                        
                        {/* 房间信息 */}
                        <div className="text-center">
                            <div className="text-sm font-mono bg-white/10 px-3 py-1 rounded-full">
                                房间: {roomId}
                            </div>
                        </div>
                        
                        {/* 占位符保持平衡 */}
                        <div className="w-16" />
                    </div>
                </div>
            </div>

            {/* 主要内容区域 */}
            <div className="container mx-auto px-4 py-6">
                {/* 状态提示 */}
                {peerLeft && (
                    <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-center animate-pulse">
                        <p className="text-red-300">对方已离开会议</p>
                    </div>
                )}

                {/* 房间信息区域 */}
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        WebRTC 视频会议
                    </h1>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <div className="font-mono text-lg bg-white/10 px-4 py-2 rounded-lg">
                            ID: {roomId}
                        </div>
                        <button 
                            onClick={copyToClipboard} 
                            className={`px-6 py-2 rounded-lg font-medium transition-all transform hover:scale-105 ${
                                copied 
                                    ? 'bg-green-500 text-white' 
                                    : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                            }`}
                        >
                            {copied ? '✓ 已复制' : '📋 复制ID'}
                        </button>
                    </div>
                </div>

                {/* 视频显示区域 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* 本地视频 */}
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur-xl group-hover:blur-2xl transition-all" />
                        <div className="relative bg-black rounded-xl overflow-hidden border border-white/20 shadow-2xl">
                            <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                <span className="text-sm font-medium">你</span>
                                {isMuted && <span className="text-red-400">🔇</span>}
                                {!videoEnabled && <span className="text-gray-400">📹</span>}
                            </div>
                            <video 
                                ref={localVideoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="w-full aspect-video bg-black object-cover" 
                            />
                        </div>
                    </div>
                    
                    {/* 远程视频 */}
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl blur-xl group-hover:blur-2xl transition-all" />
                        <div className="relative bg-black rounded-xl overflow-hidden border border-white/20 shadow-2xl">
                            <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full animate-pulse ${
                                    peerLeft ? 'bg-gray-400' : 'bg-green-400'
                                }`} />
                                <span className="text-sm font-medium">对方</span>
                                {!peerVolume && !peerLeft && <span className="text-red-400">�</span>}
                                {peerLeft && <span className="text-gray-400">离线</span>}
                            </div>
                            <video 
                                ref={remoteVideoRef} 
                                autoPlay 
                                playsInline 
                                className="w-full aspect-video bg-black object-cover" 
                            />
                            {peerLeft && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                    <div className="text-center">
                                        <div className="text-4xl mb-2">⏳</div>
                                        <p className="text-gray-400">等待对方加入...</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 控制按钮区域 */}
                <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            {/* 音频按钮 */}
                            <button 
                                onClick={toggleMute} 
                                className={`px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 flex items-center gap-2 ${
                                    isMuted 
                                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25' 
                                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                                }`}
                            >
                                {isMuted ? '🎤 取消静音' : '🔇 静音'}
                            </button>
                            
                            {/* 视频按钮 */}
                            <button 
                                onClick={toggleVideo} 
                                className={`px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 flex items-center gap-2 ${
                                    !videoEnabled 
                                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25' 
                                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                                }`}
                            >
                                {videoEnabled ? '📹 关闭视频' : '📷 开启视频'}
                            </button>
                            
                            {/* 录制按钮 */}
                            {!recording ? (
                                <button 
                                    onClick={startCanvasRecording} 
                                    className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25 flex items-center gap-2"
                                >
                                    🔴 开始录制
                                </button>
                            ) : (
                                <button 
                                    onClick={stopRecording} 
                                    className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-yellow-500/25 flex items-center gap-2 animate-pulse"
                                >
                                    ⏹️ 停止录制
                                </button>
                            )}
                            
                            {/* 离开按钮 */}
                            <button 
                                onClick={leaveMeeting} 
                                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-red-500/25 flex items-center gap-2"
                            >
                                📞 离开会议
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
