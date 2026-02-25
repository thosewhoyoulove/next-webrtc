import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { nanoid } from "nanoid";
import Head from "next/head";

export default function Home() {
    const [roomId, setRoomId] = useState("");
    const [lastRoomId, setLastRoomId] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const stored = localStorage.getItem("lastRoomId");
        if (stored) {
            setLastRoomId(stored);
        }
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
                // Smart paste: extract room ID from a full invite URL if applicable
                try {
                    const url = new URL(text.trim());
                    const match = url.pathname.match(/\/room\/([^/]+)/);
                    if (match) {
                        setRoomId(match[1]);
                        return;
                    }
                } catch {
                    // Not a valid URL — fall through to plain text
                }
                setRoomId(text.trim());
            })
            .catch(err => {
                console.error("Paste failed:", err);
            });
    };

    const quickEnterLastRoom = () => {
        if (lastRoomId) {
            router.push(`/room/${lastRoomId}`);
        }
    };

    return (
        <>
            <Head>
                <title>Nexus | WebRTC Portal</title>
                <meta name="description" content="Next generation WebRTC communication portal" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-8 overflow-hidden bg-slate-950">
                {/* Background ambient effects */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none animate-pulse-slow" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none animate-pulse-slow" style={{ animationDelay: '2s' }} />

                {/* Main Container Container */}
                <div className="z-10 w-full max-w-lg p-8 space-y-8 bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-[0_0_40px_-10px_rgba(56,189,248,0.2)] animate-float">

                    <div className="text-center space-y-2">
                        <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-blue-400 uppercase bg-blue-500/10 border border-blue-500/20 rounded-full shadow-[0_0_15px_-3px_rgba(56,189,248,0.4)]">
                            Secure Connection
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 drop-shadow-lg">
                            ENTER NEXUS
                        </h1>
                        <p className="text-slate-400 text-sm sm:text-base">Establish a real-time peer-to-peer uplink.</p>
                    </div>

                    {lastRoomId && (
                        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center transition-all hover:bg-slate-800/80 hover:border-blue-500/30">
                            <p className="mb-3 text-sm font-medium text-slate-400">Previous Uplink Terminus</p>
                            <button
                                onClick={quickEnterLastRoom}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-6 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30 transition-all shadow-[0_0_15px_-3px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_0px_rgba(99,102,241,0.4)]"
                            >
                                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                                Reconnect to {lastRoomId}
                            </button>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-500 group-focus-within:opacity-50 group-focus-within:duration-200"></div>
                            <div className="relative flex flex-col sm:flex-row items-center gap-2">
                                <input
                                    value={roomId}
                                    onChange={e => setRoomId(e.target.value)}
                                    placeholder="Enter connection ID"
                                    className="w-full bg-slate-900/80 border border-slate-700 text-slate-100 placeholder-slate-500 px-5 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                                />
                                <button
                                    onClick={pasteFromClipboard}
                                    className="w-full sm:w-auto shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-3 rounded-lg border border-slate-700 transition-colors focus:ring-2 focus:ring-slate-500 focus:outline-none"
                                >
                                    Paste
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <button
                                onClick={createRoom}
                                className="relative overflow-hidden group px-4 py-3 font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-500 transition-all shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_-2px_rgba(37,99,235,0.5)] focus:ring-2 focus:ring-blue-400 focus:outline-none"
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Initialize
                                </span>
                            </button>
                            <button
                                onClick={joinRoom}
                                disabled={!roomId.trim()}
                                className="relative overflow-hidden group px-4 py-3 font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-all shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_-2px_rgba(16,185,129,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    Join Uplink
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-6 text-slate-500 text-sm font-mono tracking-widest">
                    SYSTEM ONLINE // V1.0.0
                </div>
            </div>
        </>
    );
}
