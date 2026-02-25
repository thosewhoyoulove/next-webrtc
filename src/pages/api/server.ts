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
        socket.on("join-room", (roomId: string) => {
            socket.join(roomId);
            socket.to(roomId).emit("user-joined", socket.id);

            socket.on("offer", (data: { offer: RTCSessionDescriptionInit; roomId: string }) => {
                socket.to(roomId).emit("offer", data);
            });

            socket.on("answer", (data: { answer: RTCSessionDescriptionInit; roomId: string }) => {
                socket.to(roomId).emit("answer", data);
            });

            socket.on("ice-candidate", (data: { candidate: RTCIceCandidate; roomId: string }) => {
                socket.to(roomId).emit("ice-candidate", data);
            });

            // 处理音频状态变化
            socket.on("toggle-audio", (data: { isAudioEnabled: boolean }) => {
                console.log(`用户 ${socket.id} ${data.isAudioEnabled ? "打开" : "关闭"}了音频`);
                socket.to(roomId).emit("user-audio-toggle", {
                    userId: socket.id,
                    isAudioEnabled: data.isAudioEnabled,
                });
            });

            // 监听用户离开房间
            socket.on("leave-room", () => {
                console.log(`用户 ${socket.id} 离开了房间 ${roomId}`);
                socket.to(roomId).emit("user-left");
                socket.leave(roomId);
            });

            // 转发聊天消息
            socket.on("chat-message", (data: { text: string; time: string }) => {
                socket.to(roomId).emit("chat-message", data);
            });
        });

        // 处理断开连接
        socket.on("disconnect", () => {
            console.log(`用户 ${socket.id} 断开连接`);
            // 找到该用户所在的所有房间，并通知对方
            socket.rooms.forEach(room => {
                if (room !== socket.id) {
                    socket.to(room).emit("user-left");
                }
            });
        });
    });

    res.socket.server.io = io;
    res.end();
}
