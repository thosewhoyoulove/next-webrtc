"use client";
import VideoChat from "@/components/VideoChat";
import { Fragment } from "react";
import { useTheme } from "next-themes";
import { ThemeProvider } from "next-themes";
export default function Home() {
    const { theme, setTheme } = useTheme();

    return (
        <Fragment>
            <ThemeProvider attribute="class">
                <div className="min-h-screen flex flex-col items-center justify-center  dark:bg-gray-900">
                    The current theme is: {theme}
                    <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="absolute top-4 right-4 px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        {theme === "dark" ? "🌞 浅色模式" : "🌙 深色模式"}
                    </button>
                    <VideoChat />
                </div>
            </ThemeProvider>
        </Fragment>
    );
}
