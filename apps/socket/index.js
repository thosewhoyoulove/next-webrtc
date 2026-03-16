const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// 错误处理
io.engine.on("connection_error", err => {
    console.log("连接错误:", err.req);
    console.log("错误代码:", err.code);
    console.log("错误消息:", err.message);
    console.log("错误上下文:", err.context);
});

io.on("connection", socket => {
    let currentRoomId = null;

    socket.on("join-room", roomId => {
        if (currentRoomId) {
            socket.leave(currentRoomId);
        }

        currentRoomId = roomId;
        socket.join(roomId);
        socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("offer", data => {
        if (currentRoomId) {
            socket.to(currentRoomId).emit("offer", data);
        }
    });

    socket.on("answer", data => {
        if (currentRoomId) {
            socket.to(currentRoomId).emit("answer", data);
        }
    });

    socket.on("ice-candidate", data => {
        if (currentRoomId) {
            socket.to(currentRoomId).emit("ice-candidate", data);
        }
    });

    socket.on("toggle-audio", data => {
        if (!currentRoomId) return;

        console.log(`用户 ${socket.id} ${data.isAudioEnabled ? "打开" : "关闭"}了音频`);
        socket.to(currentRoomId).emit("user-audio-toggle", {
            userId: socket.id,
            isAudioEnabled: data.isAudioEnabled,
        });
    });

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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(` Socket.IO server running on port ${PORT}`);
});
