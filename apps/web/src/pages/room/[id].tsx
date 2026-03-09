import dynamic from "next/dynamic";
import Head from "next/head";

const RoomContent = dynamic(() => import("../../components/RoomContent"), {
    ssr: false,
    loading: () => <div className="text-white text-xl text-center mt-10">Connecting to room...</div>,
});

export default function RoomPage() {
    return (
        <>
            <Head>
                <title>Meeting Room</title>
                <meta name="description" content="Join the WebRTC room" />
            </Head>
            <RoomContent />
        </>
    );
}
