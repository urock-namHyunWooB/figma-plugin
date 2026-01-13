import React, { useEffect, useState } from "react";
import { css } from "@emotion/react";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import "highlight.js/styles/vs2015.css";

// TypeScript 언어 등록
hljs.registerLanguage("typescript", typescript);

interface CodeViewerProps {
  code: string | null;
  title?: string;
}

const containerStyle = css`
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const headerStyle = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
`;

const titleStyle = css`
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
`;

const copyButtonStyle = css`
  padding: 6px 12px;
  background: #0078d4;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #106ebe;
  }

  &:active {
    background: #005a9e;
  }
`;

const copiedButtonStyle = css`
  ${copyButtonStyle}
  background: #28a745;

  &:hover {
    background: #28a745;
  }
`;

const codeContainerStyle = css`
  flex: 1;
  overflow: auto;
  padding: 16px;

  pre {
    margin: 0;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    font-size: 13px;
    line-height: 1.5;
  }

  code {
    background: transparent !important;
  }

  /* 스크롤바 스타일 */
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #505050;
  }
`;

const emptyStateStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #808080;
  font-size: 14px;
`;

export function CodeViewer({
  code,
  title = "Generated Code",
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");

  // 코드가 변경될 때마다 하이라이팅된 HTML 생성
  useEffect(() => {
    if (code) {
      try {
        const result = hljs.highlight(code, { language: "typescript" });
        setHighlightedHtml(result.value);
      } catch {
        // 하이라이팅 실패 시 원본 코드 사용
        setHighlightedHtml(code);
      }
    } else {
      setHighlightedHtml("");
    }
  }, [code]);

  const handleCopy = async () => {
    if (!code) return;

    try {
      // 1차 시도: Clipboard API (modern browsers)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }

      // 2차 시도: execCommand fallback (iframe/plugin 환경)
      const textArea = document.createElement("textarea");
      textArea.value = code;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        console.error("execCommand copy failed");
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div css={containerStyle}>
      <div css={headerStyle}>
        <span css={titleStyle}>{title}</span>
        <button
          css={copied ? copiedButtonStyle : copyButtonStyle}
          onClick={handleCopy}
          disabled={!code}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {code ? (
        <div css={codeContainerStyle}>
          <pre>
            <code
              className="language-typescript hljs"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      ) : (
        <div css={emptyStateStyle}>
          No code generated yet. Select a component in Figma.
        </div>
      )}
    </div>
  );
}

export default CodeViewer;
