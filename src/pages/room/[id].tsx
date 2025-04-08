import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import io, { Socket } from "socket.io-client";
// import "../../styles/globals.css";
export default function RoomPage() {
    const router = useRouter();
    const { id: roomId } = router.query;
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<RTCPeerConnection | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [peerLeft, setPeerLeft] = useState(false);
    const [recording, setRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (!roomId) return;
        socketRef.current = io(); // 连接本地 Socket 服务
        // socketRef.current = io("http://192.3.0.173:3001"); // 连接远程 Socket 服务

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
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;

                peerRef.current = new RTCPeerConnection();
                stream.getTracks().forEach(track => peerRef.current?.addTrack(track, stream));

                peerRef.current.ontrack = event => {
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
                };

                peerRef.current.onicecandidate = event => {
                    if (event.candidate) socketRef.current?.emit("ice-candidate", { candidate: event.candidate, roomId });
                };

                socketRef.current?.emit("join-room", roomId);

                socketRef.current?.on("user-joined", async () => {
                    const offer = await peerRef.current?.createOffer();
                    await peerRef.current?.setLocalDescription(offer);
                    socketRef.current?.emit("offer", { offer, roomId });
                });

                socketRef.current?.on("offer", async ({ offer }) => {
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
                socketRef.current?.on("user-left", () => {
                    setPeerLeft(true);
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = null;
                    }
                });
            });

        return () => {
            socketRef.current?.emit("leave-room", roomId);

            peerRef.current?.close();
        };
    }, [roomId]);

    const toggleMute = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        const newMuted = !isMuted; // 手动计算新状态

        stream?.getAudioTracks().forEach(track => {
            track.enabled = !newMuted; // true 表示有声音
        });

        setIsMuted(newMuted);
    };

    const toggleVideo = () => {
        const stream = localVideoRef.current?.srcObject as MediaStream;
        stream?.getVideoTracks().forEach(track => (track.enabled = !videoEnabled));
        setVideoEnabled(!videoEnabled);
    };
    const copyToClipboard = () => {
        if (roomId) {
            navigator.clipboard
                .writeText(roomId as string)
                .then(() => {
                    alert("房间 ID 已复制到剪贴板！");
                })
                .catch(err => {
                    console.error("复制失败:", err);
                });
        }
    };
    const leaveMeeting = () => {
        socketRef.current?.emit("leave-room", roomId);

        peerRef.current?.close();
        router.push("/"); // 退出会议后返回主页
    };

    const startCanvasRecording = () => {
        const localVideo = localVideoRef.current;
        const remoteVideo = remoteVideoRef.current;

        if (!localVideo || !remoteVideo) {
            alert("视频还没准备好");
            return;
        }

        // 创建 Canvas
        const canvas = document.createElement("canvas");
        const width = 1280;
        const height = 720;
        canvas.width = width;
        canvas.height = height;
        canvasRef.current = canvas;
        const ctx = canvas.getContext("2d");

        const drawFrame = () => {
            if (!ctx) return;

            // 清屏
            ctx.clearRect(0, 0, width, height);

            // 画本地视频到左边
            ctx.drawImage(localVideo, 0, 0, width / 2, height);

            // 画远程视频到右边
            ctx.drawImage(remoteVideo, width / 2, 0, width / 2, height);

            animationFrameRef.current = requestAnimationFrame(drawFrame);
        };

        drawFrame();

        // 开始录制 canvas 的画面
        const canvasStream = canvas.captureStream(30); // 30 FPS
        const audioStream = new MediaStream();

        // 把本地 + 远程音轨都合并进去
        const localStream = localVideo.srcObject as MediaStream;
        const remoteStream = remoteVideo.srcObject as MediaStream;

        localStream.getAudioTracks().forEach(track => audioStream.addTrack(track));
        remoteStream.getAudioTracks().forEach(track => audioStream.addTrack(track));

        const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);

        const mediaRecorder = new MediaRecorder(combinedStream);
        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            cancelAnimationFrame(animationFrameRef.current!);

            const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `canvas-recording-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
        };

        mediaRecorder.start();
        setRecording(true);
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
            <h1>{peerLeft && <p className="text-red-500 mb-4">The other user has left the meeting.</p>}</h1>
            <div className="flex items-center gap-4 mb-6">
                <h1 className="font-bold text-2xl">Room ID: {roomId}</h1>
                <button onClick={copyToClipboard} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg cursor-pointer">
                    复制房间 ID
                </button>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full max-w-4xl">
                <div className="relative border-2 border-gray-700 rounded-lg overflow-hidden">
                    <p className="absolute top-2 left-2 bg-gray-700 px-2 py-1 text-sm rounded">You {isMuted ? "🔇" : "🔊"}</p>
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-64 bg-black" />
                </div>
                <div className="relative border-2 border-gray-700 rounded-lg overflow-hidden">
                    <p className="absolute top-2 left-2 bg-gray-700 px-2 py-1 text-sm rounded">Peer</p>
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-64 bg-black" />
                </div>
            </div>
            <div className="flex gap-4 mt-6">
                <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg cursor-pointer min-w-[120px]" onClick={toggleMute}>
                    {isMuted ? "Unmute" : "Mute"}
                </button>
                <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg cursor-pointer min-w-[160px]" onClick={toggleVideo}>
                    {videoEnabled ? "Turn Off Video" : "Turn On Video"}
                </button>
                <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg cursor-pointer min-w-[140px]" onClick={leaveMeeting}>
                    Leave Meeting
                </button>
                {!recording ? (
                    <button className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-6 rounded-lg" onClick={startCanvasRecording}>
                        录制合成画面
                    </button>
                ) : (
                    <button className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-lg" onClick={stopRecording}>
                        停止录制
                    </button>
                )}
            </div>
        </div>
    );
}
