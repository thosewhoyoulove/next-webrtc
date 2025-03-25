import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import io, { Socket } from "socket.io-client";

export default function RoomPage() {
    const router = useRouter();
    const { id: roomId } = router.query;
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        if (!roomId) return;

        socketRef.current = io();
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            peerRef.current = new RTCPeerConnection();

            stream.getTracks().forEach(track => {
                peerRef.current?.addTrack(track, stream);
            });

            peerRef.current.ontrack = event => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            };

            peerRef.current.onicecandidate = event => {
                if (event.candidate) {
                    socketRef.current?.emit("ice-candidate", { candidate: event.candidate, roomId });
                }
            };

            socketRef.current?.emit("join-room", roomId);

            socketRef.current?.on("user-joined", async () => {
                const offer = await peerRef.current!.createOffer();
                await peerRef.current!.setLocalDescription(offer);
                socketRef.current?.emit("offer", { offer, roomId });
            });

            socketRef.current?.on("offer", async ({ offer }) => {
                await peerRef.current!.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerRef.current!.createAnswer();
                await peerRef.current!.setLocalDescription(answer);
                socketRef.current?.emit("answer", { answer, roomId });
            });

            socketRef.current?.on("answer", ({ answer }) => {
                peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
            });

            socketRef.current?.on("ice-candidate", ({ candidate }) => {
                peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
            });
        });
    }, [roomId]);

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

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                backgroundColor: "#1e1e1e",
                color: "#fff",
                padding: "2rem",
            }}
        >
            <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Room ID: {roomId}</h1>
            <button onClick={copyToClipboard} style={{ backgroundColor: "#0d50bb", color: "white", padding: "10px 20px", fontSize: "1rem" }}>
                复制房间 ID
            </button>
            <div
                style={{
                    display: "flex",
                    gap: "1rem",
                    flexWrap: "wrap",
                    justifyContent: "center",
                }}
            >
                <div>
                    <p style={{ textAlign: "center" }}>You</p>
                    <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "320px", height: "240px", backgroundColor: "#000", borderRadius: "8px" }} />
                </div>
                <div>
                    <p style={{ textAlign: "center" }}>Peer</p>
                    <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "320px", height: "240px", backgroundColor: "#000", borderRadius: "8px" }} />
                </div>
            </div>
        </div>
    );
}
