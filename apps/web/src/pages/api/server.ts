import { Server } from "socket.io";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as NetServer } from "http";
import type { Socket as NetSocket } from "net";

interface SocketServer extends NetServer {
    io?: Server;
}

interface SocketWithIO extends NetSocket {
    server: SocketServer;
}

interface ResponseWithSocket extends NextApiResponse {
    socket: SocketWithIO;
}

export const config = {
    api: {
        bodyParser: false,
    },
};

export default function handler(req: NextApiRequest, res: ResponseWithSocket) {
    if (res.socket.server.io) {
        console.log("Socket is already running");
        res.end();
        return;
    }
    console.log("Setting up socket");
    const io = new Server(res.socket.server);

    // 错误处理
    io.engine.on("connection_error", err => {
        console.log("连接错误:", err.req);
        console.log("错误代码:", err.code);
        console.log("错误消息:", err.message);
        console.log("错误上下文:", err.context);
    });

    io.on("connection", socket => {
        let currentRoomId: string | null = null;

        socket.on("join-room", (roomId: string) => {
            if (currentRoomId) {
                socket.leave(currentRoomId);
            }

            currentRoomId = roomId;
            socket.join(roomId);
            socket.to(roomId).emit("user-joined", socket.id);
        });

        socket.on("offer", (data: { offer: RTCSessionDescriptionInit; roomId: string }) => {
            if (currentRoomId) {
                socket.to(currentRoomId).emit("offer", data);
            }
        });

        socket.on("answer", (data: { answer: RTCSessionDescriptionInit; roomId: string }) => {
            if (currentRoomId) {
                socket.to(currentRoomId).emit("answer", data);
            }
        });

        socket.on("ice-candidate", (data: { candidate: RTCIceCandidate; roomId: string }) => {
            if (currentRoomId) {
                socket.to(currentRoomId).emit("ice-candidate", data);
            }
        });

        // 处理音频状态变化
        socket.on("toggle-audio", (data: { isAudioEnabled: boolean }) => {
            if (!currentRoomId) return;

            console.log(`用户 ${socket.id} ${data.isAudioEnabled ? "打开" : "关闭"}了音频`);
            socket.to(currentRoomId).emit("user-audio-toggle", {
                userId: socket.id,
                isAudioEnabled: data.isAudioEnabled,
            });
        });

        // 监听用户离开房间
        socket.on("leave-room", () => {
            if (!currentRoomId) return;

            console.log(`用户 ${socket.id} 离开了房间 ${currentRoomId}`);
            socket.to(currentRoomId).emit("user-left");
            socket.leave(currentRoomId);
            currentRoomId = null;
        });

        // 处理断开连接
        socket.on("disconnect", () => {
            if (currentRoomId) {
                socket.to(currentRoomId).emit("user-left");
            }
            console.log(`用户 ${socket.id} 断开连接`);
            currentRoomId = null;
        });
    });

    res.socket.server.io = io;
    res.end();
}
