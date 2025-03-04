# WebRTC 实时会议室

基于 [Next.js](https://nextjs.org) 和 WebRTC 技术开发的实时视频会议应用。

## 功能特点

- 📹 实时视频/音频通话
- 👥 支持多人会议室
- 💬 实时文字聊天
- 🎥 屏幕共享功能
- 🔊 音频控制（静音/取消静音）
- 📱 响应式设计，支持移动端
- 🔒 安全的点对点通信
- 🎨 简洁现代的用户界面

## 技术栈

- Next.js 14
- WebRTC API
- TypeScript
- Tailwind CSS
- Socket.IO（信令服务器）
- STUN/TURN 服务器

## 开始使用

首先，运行开发服务器：

```bash
npm run dev
# 或
yarn dev
# 或
pnpm dev
# 或
bun dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 即可访问应用。

## 本地开发设置

1. 克隆项目

```bash
git clone git@github.com:thosewhoyoulove/next-webrtc.git
```

1. 安装依赖

```bash
npm install
```

1. 配置环境变量

```bash
cp .env.example .env.local
```

需要配置的环境变量：

- `TURN_SERVER_URL` - TURN 服务器地址
- `TURN_SERVER_USERNAME` - TURN 服务器用户名
- `TURN_SERVER_CREDENTIAL` - TURN 服务器密码
- `SOCKET_SERVER_URL` - WebSocket 服务器地址

## 使用说明

1. 创建会议室：点击"创建会议"按钮
2. 分享会议链接：复制生成的会议链接分享给其他参与者
3. 加入会议：通过会议链接直接加入
4. 权限设置：首次加入需要允许浏览器访问摄像头和麦克风

## 浏览器支持

- Chrome 版本 > 60
- Firefox 版本 > 55
- Safari 版本 > 11
- Edge 版本 > 79

## 部署

本项目可以部署到 [Vercel 平台](https://vercel.com)。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=your-repo-url)

注意：部署时需要确保：

1. TURN 服务器配置正确
2. WebSocket 服务器可用
3. 必要的环境变量已设置

## 贡献指南

欢迎提交 Pull Request 和 Issue。在提交之前，请确保：

1. 代码经过测试
2. 遵循项目的代码规范
3. 提交信息清晰明确

## 许可证

[MIT](LICENSE)
