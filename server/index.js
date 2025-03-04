import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true,
    },
});
// 添加错误处理
io.engine.on("connection_error", err => {
    console.log("连接错误:", err.req); // 请求对象
    console.log("错误代码:", err.code); // 错误代码
    console.log("错误消息:", err.message); // 错误信息
    console.log("错误上下文:", err.context); // 额外的错误信息
});
io.on("connection", socket => {
    console.log("用户已连接");

    socket.on("offer", offer => {
        // 广播给除了发送者以外的所有客户端
        socket.broadcast.emit("offer", offer);
    });

    socket.on("answer", answer => {
        socket.broadcast.emit("answer", answer);
    });

    socket.on("ice-candidate", candidate => {
        socket.broadcast.emit("ice-candidate", candidate);
    });

    socket.on("disconnect", () => {
        console.log("用户已断开连接");
    });
});

// 添加基本的路由处理
app.get("/", (req, res) => {
    res.send("WebRTC 信令服务器正在运行");
});

// 处理其他路由
app.use((req, res) => {
    res.status(404).send("未找到页面");
});

server.listen(3001, () => {
    console.log("服务器运行在端口 3001");
});
