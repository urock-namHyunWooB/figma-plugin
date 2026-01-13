import { defineConfig } from "@twind/core";
import presetTailwind from "@twind/preset-tailwind";
import presetAutoprefix from "@twind/preset-autoprefix";

export default defineConfig({
  presets: [presetAutoprefix(), presetTailwind()],
  // arbitrary value 지원을 위한 설정
  hash: false,
  // 모든 CSS 변수 지원
  theme: {
    extend: {},
  },
  // 규칙 추가 (필요시)
  rules: [],
  // 무시할 클래스 패턴 (Emotion, highlight.js 등)
  ignorelist: [
    /^css-/,           // Emotion 클래스
    /^hljs/,           // highlight.js 클래스
    /^language-/,      // 코드 언어 클래스
    /^class_$/,        // highlight.js 클래스
    /^function_$/,     // highlight.js 클래스
  ],
});
