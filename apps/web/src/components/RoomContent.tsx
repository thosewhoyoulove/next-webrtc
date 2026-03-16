// src/components/RoomContent.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import io, { Socket } from "socket.io-client";
import { useSubtitleRecognizer } from "@/hooks/useSubtitleRecognizer";

type LoggerData = Record<string, unknown> | string | number | boolean | null | undefined;

// 日志工具
const logger = {
    info: (message: string, data?: LoggerData) => {
        console.log(`[WebRTC-Info] ${message}`, data || '');
    },
    error: (message: string, error?: unknown) => {
        console.error(`[WebRTC-Error] ${message}`, error || '');
    },
    warn: (message: string, data?: LoggerData) => {
        console.warn(`[WebRTC-Warn] ${message}`, data || '');
    }
};

export default function RoomContent() {
    const router = useRouter();
    const { id: roomId } = router.query;
    const [roomLink, setRoomLink] = useState("");

    // 视频相关的 ref
    const localVideoRef = useRef<HTMLVideoElement>(null); // 本地视频元素引用
    const remoteVideoRef = useRef<HTMLVideoElement>(null); // 远程视频元素引用

    // WebRTC 相关的 ref
    const socketRef = useRef<Socket | null>(null); // Socket.io 连接引用
    const peerRef = useRef<RTCPeerConnection | null>(null); // WebRTC 连接引用
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const subtitleRef = useRef("");

    // UI 状态管理
    const [isMuted, setIsMuted] = useState(false); // 静音状态
    const [videoEnabled, setVideoEnabled] = useState(true); // 视频开启状态
    const [peerLeft, setPeerLeft] = useState(true); // 对方是否离开
    const [recording, setRecording] = useState(false); // 录制状态
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting'); // 连接状态
    const [copied, setCopied] = useState(false); // 复制状态
    const [shareCopied, setShareCopied] = useState(false);
    const [callSeconds, setCallSeconds] = useState(0);
    const [displayName, setDisplayName] = useState("你");
    const [focusMode, setFocusMode] = useState(false);

    // 录制相关的 ref
    const mediaRecorderRef = useRef<MediaRecorder | null>(null); // 媒体录制器引用
    const recordedChunksRef = useRef<Blob[]>([]); // 录制的数据块
    const canvasRef = useRef<HTMLCanvasElement | null>(null); // 画布引用
    const animationFrameRef = useRef<number | undefined>(undefined); // 动画帧引用

    // 语音识别 Hook
    const { subtitle, startRecognition, stopRecognition } = useSubtitleRecognizer("zh-CN");
    //获取对方的音量是否开关
    const [peerVolume, setPeerVolume] = useState(true);

    useEffect(() => {
        subtitleRef.current = subtitle;
    }, [subtitle]);

    useEffect(() => {
        const storedName = localStorage.getItem("displayName");
        if (storedName) {
            setDisplayName(storedName);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setRoomLink(window.location.href);
        }
    }, [roomId]);

    useEffect(() => {
        if (peerLeft) {
            setCallSeconds(0);
            return;
        }

        const timer = window.setInterval(() => {
            setCallSeconds(prev => prev + 1);
        }, 1000);

        return () => window.clearInterval(timer);
    }, [peerLeft]);

    const cleanupRoomResources = useCallback((currentRoomId?: string | string[]) => {
        const room = typeof currentRoomId === "string" ? currentRoomId : undefined;

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = undefined;
        }

        stopRecognition();
        setRecording(false);

        if (room) {
            socketRef.current?.emit("leave-room", room);
        }

        socketRef.current?.removeAllListeners();
        socketRef.current?.disconnect();
        socketRef.current = null;

        peerRef.current?.close();
        peerRef.current = null;

        localStreamRef.current?.getTracks().forEach(track => track.stop());
        remoteStreamRef.current?.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        remoteStreamRef.current = null;

        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }

        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
    }, [stopRecognition]);

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
                localStreamRef.current = stream;

                // 创建 WebRTC 连接
                logger.info('创建RTCPeerConnection');
                peerRef.current = new RTCPeerConnection({
                    iceServers: [
                        { urls: "stun:stun.l.google.com:19302" },
                        { urls: "stun:stun1.l.google.com:19302" },
                    ],
                });
                
                // 添加本地媒体轨道到连接中
                stream.getTracks().forEach(track => {
                    logger.info(`添加本地轨道: ${track.kind}`);
                    peerRef.current?.addTrack(track, stream);
                });

                // 处理远程视频流
                peerRef.current.ontrack = event => {
                    logger.info('收到远程视频流', { streams: event.streams.length });
                    remoteStreamRef.current = event.streams[0];
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
                    setPeerVolume(true);
                    remoteStreamRef.current = null;
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
            cleanupRoomResources(roomId);
        };
    }, [cleanupRoomResources, roomId]);

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
        cleanupRoomResources(roomId);
        router.push("/");
    };

    const shareRoom = async () => {
        if (!roomLink) return;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: "FlowCall Meeting",
                    text: `加入我的会议房间：${roomId}`,
                    url: roomLink,
                });
                return;
            }

            await navigator.clipboard.writeText(roomLink);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch (error) {
            logger.error("分享房间失败", error);
        }
    };

    // 开始录制会议
    const startCanvasRecording = () => {
        const localVideo = localVideoRef.current;
        const remoteVideo = remoteVideoRef.current;
        const localStream = localStreamRef.current;
        const remoteStream = remoteStreamRef.current;
        const remoteVideoReady = remoteVideo && remoteVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

        if (!localVideo || !remoteVideo || !localStream || !remoteStream || !remoteVideoReady) {
            logger.warn('视频未准备好，无法开始录制');
            return alert("双方视频都准备好后才能开始录制");
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
            ctx.fillText(subtitleRef.current, 640, 710);

            // 请求下一帧
            animationFrameRef.current = requestAnimationFrame(drawFrame);
        };

        drawFrame();

        // 从画布创建视频流
        const canvasStream = canvas.captureStream(30);

        // 创建音频流
        const audioStream = new MediaStream();

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
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
            const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `recording-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
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

    const formatDuration = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .filter((value, index) => value > 0 || index > 0)
            .map(value => value.toString().padStart(2, "0"))
            .join(":");
    };

    const remoteStatusLabel = peerLeft ? "等待加入" : "通话中";

    return (
        <div className="relative min-h-screen overflow-hidden text-white">
            <div className="soft-grid absolute inset-0 opacity-30" />
            <div className="pointer-events-none absolute left-0 top-24 h-64 w-64 rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="pointer-events-none absolute right-0 top-1/4 h-72 w-72 rounded-full bg-orange-400/10 blur-3xl" />

            <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-28 pt-4 sm:px-6 lg:px-8">
                <header className="glass-panel mb-5 rounded-[1.75rem] px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                                connectionStatus === 'connected'
                                    ? 'bg-emerald-400/12 text-emerald-100'
                                    : connectionStatus === 'connecting'
                                        ? 'bg-amber-400/12 text-amber-100'
                                        : 'bg-red-400/12 text-red-100'
                            }`}>
                                <span className={`h-2.5 w-2.5 rounded-full ${
                                    connectionStatus === 'connected'
                                        ? 'bg-emerald-300'
                                        : connectionStatus === 'connecting'
                                            ? 'bg-amber-300'
                                            : 'bg-red-300'
                                }`} />
                                {connectionStatus === 'connected' ? '信令已连接' :
                                    connectionStatus === 'connecting' ? '正在连接' : '连接断开'}
                            </div>
                            <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm text-slate-200">
                                房间 <span className="ml-1 font-mono text-white">{roomId}</span>
                            </div>
                            <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm text-slate-200">
                                时长 <span className="ml-1 font-medium text-white">{formatDuration(callSeconds)}</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={copyToClipboard} className="ghost-button rounded-full px-4 py-2 text-sm transition hover:bg-white/12">
                                {copied ? "已复制房间号" : "复制房间号"}
                            </button>
                            <button onClick={shareRoom} className="ghost-button rounded-full px-4 py-2 text-sm transition hover:bg-white/12">
                                {shareCopied ? "链接已复制" : "分享房间链接"}
                            </button>
                            <button
                                onClick={() => setFocusMode(prev => !prev)}
                                className="ghost-button rounded-full px-4 py-2 text-sm transition hover:bg-white/12"
                            >
                                {focusMode ? "退出专注模式" : "专注模式"}
                            </button>
                        </div>
                    </div>
                </header>

                <section className={`grid flex-1 gap-5 ${focusMode ? "lg:grid-cols-[1fr_320px]" : "lg:grid-cols-[1.25fr_0.75fr]"}`}>
                    <div className="relative order-2 flex min-h-[420px] flex-col gap-4 lg:order-1">
                        <article className="glass-panel relative flex-1 overflow-hidden rounded-[2rem] border border-white/12">
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                className="h-full min-h-[420px] w-full bg-slate-950 object-cover"
                            />

                            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-5">
                                <div className="rounded-2xl bg-black/45 px-4 py-3 backdrop-blur-md">
                                    <div className="flex items-center gap-2 text-sm text-slate-200">
                                        <span className={`h-2.5 w-2.5 rounded-full ${peerLeft ? "bg-slate-400" : "bg-emerald-300"}`} />
                                        {remoteStatusLabel}
                                    </div>
                                    <div className="mt-1 text-lg font-semibold text-white">远端画面</div>
                                </div>

                                {!peerVolume && !peerLeft && (
                                    <div className="rounded-full bg-black/45 px-3 py-2 text-sm text-red-100 backdrop-blur-md">
                                        对方已静音
                                    </div>
                                )}
                            </div>

                            {peerLeft && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/78">
                                    <div className="mx-6 max-w-sm text-center">
                                        <div className="mb-4 text-5xl">等待</div>
                                        <h2 className="text-2xl font-semibold text-white">对方还没有加入房间</h2>
                                        <p className="mt-3 text-sm leading-6 text-slate-300">
                                            你可以先复制房间号或分享链接，对方加入后会自动建立通话连接。
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                                <div className="max-w-[70%] rounded-2xl bg-black/45 px-4 py-3 text-sm text-slate-100 backdrop-blur-md">
                                    <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-300">Live Subtitle</div>
                                    <div className="line-clamp-2 min-h-[2.5rem] text-sm leading-6">
                                        {subtitle || "开启录制后，这里会展示实时字幕预览。"}
                                    </div>
                                </div>

                                <div className="hidden rounded-2xl bg-black/45 px-4 py-3 text-right text-sm text-slate-200 backdrop-blur-md sm:block">
                                    <div>{displayName}</div>
                                    <div className="mt-1 text-xs text-slate-400">{videoEnabled ? "摄像头开启" : "摄像头关闭"}</div>
                                </div>
                            </div>
                        </article>

                        <article className="glass-panel absolute bottom-4 right-4 z-20 w-36 overflow-hidden rounded-[1.5rem] border border-white/12 shadow-2xl sm:w-44 lg:static lg:w-full lg:rounded-[2rem]">
                            <div className="absolute left-3 top-3 z-10 rounded-full bg-black/55 px-3 py-1 text-xs text-slate-100 backdrop-blur-md">
                                {displayName}
                            </div>
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="aspect-[4/5] w-full bg-slate-950 object-cover lg:aspect-video"
                            />
                            <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-slate-200">
                                <span>{isMuted ? "麦克风关闭" : "麦克风开启"}</span>
                                <span>{videoEnabled ? "视频开启" : "视频关闭"}</span>
                            </div>
                        </article>
                    </div>

                    {!focusMode && (
                        <aside className="order-1 flex flex-col gap-4 lg:order-2">
                            <section className="glass-panel rounded-[2rem] p-5">
                                <div className="mb-4">
                                    <div className="text-sm uppercase tracking-[0.18em] text-slate-300">Session</div>
                                    <h2 className="mt-2 text-2xl font-semibold text-white">会议面板</h2>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                                        <div className="text-sm text-slate-300">房间链接</div>
                                        <div className="mt-2 break-all text-sm leading-6 text-white/90">{roomLink || "正在生成链接..."}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                                        <div className="text-sm text-slate-300">当前状态</div>
                                        <div className="mt-2 text-lg font-semibold text-white">{peerLeft ? "等待成员" : "已进入通话"}</div>
                                        <div className="mt-1 text-sm text-slate-300">
                                            {recording ? "录制进行中" : "可随时开始录制"}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="glass-panel rounded-[2rem] p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-sm uppercase tracking-[0.18em] text-slate-300">Quick Notes</div>
                                        <h3 className="mt-2 text-xl font-semibold text-white">使用提示</h3>
                                    </div>
                                </div>
                                <div className="space-y-3 text-sm leading-6 text-slate-300">
                                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                                        手机端建议竖屏使用，底部按钮区已经加大触控面积。
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                                        如果对方暂未加入，可以直接点击“分享房间链接”发给对方。
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                                        录制会把双路画面与字幕一起保存成本地 `webm` 文件。
                                    </div>
                                </div>
                            </section>
                        </aside>
                    )}
                </section>

                <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-slate-950/78 px-4 py-4 backdrop-blur-2xl">
                    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3 sm:gap-4">
                        <button
                            onClick={toggleMute}
                            className={`min-w-[9rem] rounded-2xl px-5 py-3 text-sm font-medium transition ${
                                isMuted ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "ghost-button hover:bg-white/12"
                            }`}
                        >
                            {isMuted ? "打开麦克风" : "静音"}
                        </button>

                        <button
                            onClick={toggleVideo}
                            className={`min-w-[9rem] rounded-2xl px-5 py-3 text-sm font-medium transition ${
                                !videoEnabled ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "ghost-button hover:bg-white/12"
                            }`}
                        >
                            {videoEnabled ? "关闭视频" : "开启视频"}
                        </button>

                        {!recording ? (
                            <button
                                onClick={startCanvasRecording}
                                className="accent-button min-w-[9rem] rounded-2xl px-5 py-3 text-sm font-medium transition hover:-translate-y-0.5"
                            >
                                开始录制
                            </button>
                        ) : (
                            <button
                                onClick={stopRecording}
                                className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:-translate-y-0.5"
                            >
                                停止录制
                            </button>
                        )}

                        <button
                            onClick={leaveMeeting}
                            className="rounded-2xl bg-red-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-red-500/20 transition hover:-translate-y-0.5"
                        >
                            离开会议
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
