import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nanoid } from "nanoid";
import Head from "next/head";

const featureCards = [
    { title: "Instant Rooms", description: "一键生成房间，链接可直接分享给另一台设备或其他成员。" },
    { title: "Mobile Ready", description: "界面针对手机底部操作区重新布局，单手也更容易操作。" },
    { title: "Record & Review", description: "支持录制会议画面并叠加实时字幕，方便回看重点内容。" },
];

export default function Home() {
    const [roomId, setRoomId] = useState("");
    const [lastRoomId, setLastRoomId] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState("");
    const router = useRouter();

    useEffect(() => {
        const storedRoomId = localStorage.getItem("lastRoomId");
        const storedName = localStorage.getItem("displayName");

        if (storedRoomId) {
            setLastRoomId(storedRoomId);
        }

        if (storedName) {
            setDisplayName(storedName);
        }
    }, []);

    const persistProfile = () => {
        if (displayName.trim()) {
            localStorage.setItem("displayName", displayName.trim());
        }
    };

    const openRoom = (targetRoomId: string) => {
        if (!targetRoomId.trim()) return;

        persistProfile();
        router.push(`/room/${targetRoomId.trim()}`);
    };

    const joinRoom = () => {
        openRoom(roomId);
    };

    const createRoom = () => {
        const newRoomId = nanoid(8);
        openRoom(newRoomId);
    };

    const pasteFromClipboard = () => {
        navigator.clipboard
            .readText()
            .then(text => {
                setRoomId(text.trim());
            })
            .catch(err => {
                console.error("粘贴失败:", err);
            });
    };

    const quickEnterLastRoom = () => {
        if (lastRoomId) {
            openRoom(lastRoomId);
        }
    };

    return (
        <>
            <Head>
                <title>FlowCall</title>
                <meta name="description" content="Join or create a polished WebRTC room in seconds" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <main className="relative min-h-screen overflow-hidden">
                <div className="soft-grid absolute inset-0 opacity-40" />
                <div className="pointer-events-none absolute -left-16 top-16 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
                <div className="pointer-events-none absolute right-0 top-1/3 h-72 w-72 rounded-full bg-orange-400/15 blur-3xl" />

                <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
                    <header className="mb-10 flex items-center justify-between">
                        <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-100/80">
                                FlowCall
                            </div>
                            <p className="text-sm text-slate-300">更轻、更顺手的视频房间体验</p>
                        </div>
                        <div className="hidden rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200 md:block">
                            WebRTC + Next.js
                        </div>
                    </header>

                    <section className="grid flex-1 items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="max-w-2xl">
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-3 py-1 text-sm text-emerald-100">
                                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                                可快速创建并从手机加入
                            </div>

                            <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                                更现代的会议房间，
                                <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-orange-200 bg-clip-text text-transparent"> 更适合桌面与移动端</span>
                            </h1>

                            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                                创建房间、分享链接、继续上次会议都在同一个入口完成。界面针对触屏和小屏设备重新布局，首次打开也更清晰。
                            </p>

                            <div className="mt-8 grid gap-4 sm:grid-cols-3">
                                {featureCards.map(card => (
                                    <article key={card.title} className="glass-panel rounded-3xl p-4">
                                        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/90">{card.title}</h2>
                                        <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                                    </article>
                                ))}
                            </div>
                        </div>

                        <section className="glass-panel rounded-[2rem] p-5 sm:p-7">
                            <div className="mb-6">
                                <p className="text-sm uppercase tracking-[0.22em] text-slate-300">Start a session</p>
                                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">进入你的会议房间</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                    输入房间号加入，或者直接创建一个新房间开始通话。
                                </p>
                            </div>

                            <div className="space-y-4">
                                <label className="block">
                                    <span className="mb-2 block text-sm text-slate-300">你的昵称</span>
                                    <input
                                        value={displayName}
                                        onBlur={persistProfile}
                                        onChange={e => setDisplayName(e.target.value)}
                                        placeholder="例如：Peter"
                                        className="w-full rounded-2xl border border-white/12 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 block text-sm text-slate-300">房间 ID</span>
                                    <div className="flex flex-col gap-3 sm:flex-row">
                                        <input
                                            value={roomId}
                                            onChange={e => setRoomId(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter") {
                                                    joinRoom();
                                                }
                                            }}
                                            placeholder="输入或粘贴房间号"
                                            className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
                                        />
                                        <button onClick={pasteFromClipboard} className="ghost-button rounded-2xl px-4 py-3 transition hover:bg-white/12">
                                            粘贴
                                        </button>
                                    </div>
                                </label>
                            </div>

                            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                <button onClick={createRoom} className="accent-button rounded-2xl px-5 py-3 font-medium transition hover:-translate-y-0.5">
                                    创建房间
                                </button>
                                <button onClick={joinRoom} className="primary-button rounded-2xl px-5 py-3 font-medium transition hover:-translate-y-0.5">
                                    加入房间
                                </button>
                            </div>

                            {lastRoomId && (
                                <button
                                    onClick={quickEnterLastRoom}
                                    className="mt-5 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-4 py-4 text-left transition hover:bg-white/12"
                                >
                                    <span>
                                        <span className="block text-sm text-slate-300">上次房间</span>
                                        <span className="mt-1 block font-mono text-lg text-white">{lastRoomId}</span>
                                    </span>
                                    <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-cyan-100">快速返回</span>
                                </button>
                            )}

                            <div className="mt-6 grid gap-3 rounded-3xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300 sm:grid-cols-3">
                                <div>
                                    <div className="text-lg font-semibold text-white">P2P</div>
                                    <div className="mt-1">浏览器直连媒体流</div>
                                </div>
                                <div>
                                    <div className="text-lg font-semibold text-white">1 Tap</div>
                                    <div className="mt-1">一键复制房间并分享</div>
                                </div>
                                <div>
                                    <div className="text-lg font-semibold text-white">Mobile</div>
                                    <div className="mt-1">适配竖屏和底部操作区</div>
                                </div>
                            </div>
                        </section>
                    </section>
                </div>
            </main>
        </>
    );
}
