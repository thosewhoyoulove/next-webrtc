// src/hooks/useSubtitleRecognizer.ts
import { useEffect, useRef, useState } from "react";

/**
 * 语音识别事件接口定义
 * 继承自基础 Event 接口，添加 results 属性用于存储识别结果
 */
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
}

/**
 * 语音识别器接口定义
 * 继承自 EventTarget，定义了语音识别所需的核心属性和方法
 */
interface SpeechRecognition extends EventTarget {
    lang: string; // 识别语言
    continuous: boolean; // 是否持续识别
    interimResults: boolean; // 是否返回中间结果
    start(): void; // 开始识别
    stop(): void; // 停止识别
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null; // 识别结果回调
    onerror: ((this: SpeechRecognition, ev: ErrorEvent) => void) | null; // 错误处理回调
}

/**
 * 全局类型声明
 * 为 Window 对象添加 SpeechRecognition 和 webkitSpeechRecognition 属性
 * 用于兼容不同浏览器的语音识别 API
 */
declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognition;
        webkitSpeechRecognition: new () => SpeechRecognition;
    }
}

/**
 * 字幕识别 Hook
 * @param lang 识别语言，默认为中文
 * @returns 包含字幕内容和控制方法的对象
 */
export function useSubtitleRecognizer(lang = "zh-CN") {
    // 存储当前识别的字幕文本
    const [subtitle, setSubtitle] = useState("");
    // 存储语音识别器实例的引用
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    useEffect(() => {
        // 获取浏览器支持的语音识别 API
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("浏览器不支持 Web Speech API");
            return;
        }

        // 创建语音识别器实例
        const recognition = new SpeechRecognition();
        // 设置识别语言
        recognition.lang = lang;
        // 启用持续识别模式
        recognition.continuous = true;
        // 启用中间结果返回
        recognition.interimResults = true;

        // 处理识别结果
        recognition.onresult = (event: SpeechRecognitionEvent) => {
            // 将所有识别片段合并为完整文本
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join("");
            setSubtitle(transcript);
        };

        // 错误处理
        recognition.onerror = (e: ErrorEvent) => {
            console.error("语音识别错误：", e);
        };

        // 保存识别器实例
        recognitionRef.current = recognition;
    }, [lang]);

    // 开始识别的方法
    const start = () => {
        recognitionRef.current?.start();
    };

    // 停止识别的方法
    const stop = () => {
        recognitionRef.current?.stop();
    };

    // 返回字幕内容和控制方法
    return { subtitle, startRecognition: start, stopRecognition: stop };
}
