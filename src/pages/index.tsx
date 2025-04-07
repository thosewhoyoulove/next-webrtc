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
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
            <h1 className="text-3xl mb-4">Enter Meeting Room</h1>
            <div className="flex gap-4 items-center mb-4">
                <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Enter Room ID" className="px-4 py-2 text-base rounded-md bg-white text-black w-48" />
                <button onClick={pasteFromClipboard} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg cursor-pointer">
                    粘贴
                </button>
            </div>
            <div className="flex gap-4">
                <button onClick={createRoom} className="px-4 py-2 text-base rounded-md bg-green-500 hover:bg-green-600 text-white cursor-pointer">
                    Create Room
                </button>
                <button onClick={joinRoom} className="px-4 py-2 text-base rounded-md bg-blue-500 hover:bg-blue-600 text-white cursor-pointer">
                    Join Room
                </button>
            </div>
        </div>
    );
}
