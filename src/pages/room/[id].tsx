import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import io, { Socket } from "socket.io-client";
import "../../styles/globals.css";
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
    useEffect(() => {
        if (!roomId) return;

        socketRef.current = io();
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
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
        stream?.getAudioTracks().forEach(track => (track.enabled = !isMuted));
        setIsMuted(!isMuted);
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
            </div>
        </div>
    );
}
