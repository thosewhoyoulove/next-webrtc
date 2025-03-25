import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nanoid } from "nanoid";

export default function Home() {
    const [roomId, setRoomId] = useState("");
    const router = useRouter();
    useEffect(() => {
        fetch("/api/socket");
    }, []);
    const joinRoom = () => {
        if (roomId.trim()) {
            router.push(`/room/${roomId}`);
        }
    };

    const createRoom = () => {
        const newRoomId = nanoid(8);
        router.push(`/room/${newRoomId}`);
    };

    const pasteFromClipboard = () => {
        navigator.clipboard
            .readText()
            .then(text => {
                setRoomId(text);
            })
            .catch(err => {
                console.error("粘贴失败:", err);
            });
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
                backgroundColor: "#1e1e1e",
                color: "#fff",
            }}
        >
            <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Enter Meeting Room</h1>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
                <input
                    value={roomId}
                    onChange={e => setRoomId(e.target.value)}
                    placeholder="Enter Room ID"
                    style={{
                        padding: "0.5rem",
                        fontSize: "1rem",
                        borderRadius: "6px",

                        width: "200px",
                    }}
                />
                <button onClick={pasteFromClipboard} style={{ padding: "0.5rem", fontSize: "1rem", marginLeft: "10px" }}>
                    粘贴
                </button>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
                <button
                    onClick={joinRoom}
                    style={{
                        padding: "0.5rem 1rem",
                        fontSize: "1rem",
                        borderRadius: "6px",
                        backgroundColor: "#0070f3",
                        color: "#fff",
                        cursor: "pointer",
                    }}
                >
                    Join Room
                </button>
                <button
                    onClick={createRoom}
                    style={{
                        padding: "0.5rem 1rem",
                        fontSize: "1rem",
                        borderRadius: "6px",
                        backgroundColor: "#28a745",
                        color: "#fff",
                        cursor: "pointer",
                    }}
                >
                    Create Room
                </button>
            </div>
        </div>
    );
}
