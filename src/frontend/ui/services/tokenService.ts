import { MESSAGE_TYPES } from "../../../backend/types/messages";
import type { DesignToken } from "../../../backend/types/messages";

/**
 * Figma Plugin 백엔드에 디자인 토큰 추출 요청
 * 응답을 Promise로 래핑하여 반환
 */
export function requestDesignTokens(): Promise<DesignToken[]> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      window.removeEventListener("message", handler);
      clearTimeout(timer);
    };

    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === MESSAGE_TYPES.DESIGN_TOKENS_RESULT) {
        cleanup();
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.tokens);
        }
      }
    };

    window.addEventListener("message", handler);

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("디자인 토큰 추출 타임아웃"));
    }, 10_000);

    parent.postMessage(
      { pluginMessage: { type: MESSAGE_TYPES.EXTRACT_DESIGN_TOKENS } },
      "*"
    );
  });
}

/**
 * DesignToken 배열을 CSS 파일 문자열로 변환
 *
 * 출력 예시:
 * ```css
 * :root {
 *   --Color-primary-01: #628cf5;
 *   --Color-bg-00: #ffffff;
 * }
 * ```
 */
export function generateTokensCSS(tokens: DesignToken[]): string {
  if (tokens.length === 0) return "";

  const sorted = [...tokens].sort((a, b) => a.name.localeCompare(b.name));
  const lines = sorted.map((t) => `  --${t.name}: ${t.value};`);

  return `:root {\n${lines.join("\n")}\n}\n`;
}
