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

// 存储每个房间的用户信息
const rooms = {};

// 生成唯一的邀请码
const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// 错误处理
io.engine.on("connection_error", err => {
    console.log("连接错误:", err.req);
    console.log("错误代码:", err.code);
    console.log("错误消息:", err.message);
    console.log("错误上下文:", err.context);
});

io.on("connection", socket => {
    console.log("用户已连接");

    // 监听创建房间请求
    socket.on("create-room", () => {
        const inviteCode = generateInviteCode();

        // 创建房间并将用户加入
        rooms[inviteCode] = [socket.id];
        socket.join(inviteCode);
        console.log(`房间 ${inviteCode} 创建成功`);

        // 将邀请码发送给客户端
        socket.emit("room-created", inviteCode);
    });

    // 监听加入房间请求
    socket.on("join-room", inviteCode => {
        if (rooms[inviteCode]) {
            rooms[inviteCode].push(socket.id);
            socket.join(inviteCode);
            console.log(`用户加入房间: ${inviteCode}`);

            // 通知房间内的其他用户新用户加入
            socket.to(inviteCode).emit("user-joined", socket.id);
        } else {
            socket.emit("error", "房间不存在或邀请码错误");
        }
    });

    // 监听 offer
    socket.on("offer", (offer, inviteCode) => {
        console.log("offer", inviteCode);
        socket.to(inviteCode).emit("offer", offer);
    });

    // 监听 answer
    socket.on("answer", (answer, inviteCode) => {
        console.log("answer", inviteCode);
        socket.to(inviteCode).emit("answer", answer);
    });

    // 监听 ice-candidate
    socket.on("ice-candidate", (candidate, inviteCode) => {
        console.log("ice-candidate", inviteCode);
        socket.to(inviteCode).emit("ice-candidate", candidate);
    });

    // 监听用户断开连接
    socket.on("disconnect", () => {
        for (let room in rooms) {
            rooms[room] = rooms[room].filter(id => id !== socket.id);
            if (rooms[room].length === 0) {
                delete rooms[room]; // 删除空的房间
            }
        }
        console.log("用户已断开连接");
    });
});

// 路由
app.get("/", (req, res) => {
    res.send("WebRTC 信令服务器正在运行");
});

app.use((req, res) => {
    res.status(404).send("未找到页面");
});

server.listen(3001, () => {
    console.log("服务器运行在端口 3001");
});
