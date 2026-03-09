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
    socket.on("join-room", roomId => {
        socket.join(roomId);
        socket.to(roomId).emit("user-joined", socket.id);

        socket.on("offer", data => {
            socket.to(roomId).emit("offer", data);
        });

        socket.on("answer", data => {
            socket.to(roomId).emit("answer", data);
        });

        socket.on("ice-candidate", data => {
            socket.to(roomId).emit("ice-candidate", data);
        });

        // 处理音频状态变化
        socket.on("toggle-audio", data => {
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
    });

    // 处理断开连接
    socket.on("disconnect", () => {
        console.log(`用户 ${socket.id} 断开连接`);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(` Socket.IO server running on port ${PORT}`);
});
