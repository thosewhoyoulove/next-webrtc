import { useState } from "react";
import { useRouter } from "next/router";
import { nanoid } from "nanoid";
export default function Home() {
    const [roomId, setRoomId] = useState("");
    const router = useRouter();

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
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white px-4 py-8">
            <h1 className="text-2xl sm:text-3xl mb-6 text-center">Enter Meeting Room</h1>

            <div className="flex flex-col justify-center sm:flex-row items-center gap-4 w-full max-w-md mb-6">
                <input
                    value={roomId}
                    onChange={e => setRoomId(e.target.value)}
                    placeholder="Enter Room ID"
                    className="w-full sm:w-48 px-4 py-2 text-base rounded-md bg-white text-black"
                />
                <button onClick={pasteFromClipboard} className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg">
                    Paste
                </button>
            </div>

            <div className="flex flex-col justify-center sm:flex-row gap-4 w-full max-w-md">
                <button onClick={createRoom} className="w-full sm:w-auto px-4 py-2 text-base rounded-md bg-green-500 hover:bg-green-600 text-white">
                    Create Room
                </button>
                <button onClick={joinRoom} className="w-full sm:w-auto px-4 py-2 text-base rounded-md bg-blue-500 hover:bg-blue-600 text-white">
                    Join Room
                </button>
            </div>
        </div>
    );
}
