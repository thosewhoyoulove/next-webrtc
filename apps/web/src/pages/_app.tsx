import "../styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";

export default function App({ Component, pageProps }: AppProps) {
    useEffect(() => {
        // 只在开发环境中初始化 vconsole
        if (process.env.NODE_ENV === "development") {
            import("vconsole").then((VConsole) => {
                new VConsole.default();
            });
        }
    }, []);

    return <Component {...pageProps} />;
}
