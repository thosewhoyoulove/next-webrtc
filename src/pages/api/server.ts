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
    console.log("EEEEEEE");
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

            socket.on("offer", (data: RTCSessionDescriptionInit) => {
                socket.to(roomId).emit("offer", data);
            });

            socket.on("answer", (data: RTCSessionDescriptionInit) => {
                socket.to(roomId).emit("answer", data);
            });

            socket.on("ice-candidate", (data: RTCIceCandidate) => {
                socket.to(roomId).emit("ice-candidate", data);
            });
            // 监听用户离开房间
            socket.on("leave-room", inviteCode => {
                console.log("leave-room", inviteCode);
                socket.to(inviteCode).emit("user-left"); // 通知房间里的其他用户
            });
        });
    });

    res.socket.server.io = io;

    res.end();
}
