import { RefObject } from "react";

interface Props {
    roomId: string | string[] | undefined;
    localVideoRef: RefObject<HTMLVideoElement>;
    remoteVideoRef: RefObject<HTMLVideoElement>;
}

export default function VideoLayout({ roomId, localVideoRef, remoteVideoRef }: Props) {
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
