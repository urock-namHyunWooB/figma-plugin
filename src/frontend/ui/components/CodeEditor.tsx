import React, { useEffect, useRef, useState, useCallback } from "react";
import { css } from "@emotion/react";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
} from "@codemirror/language";

interface CodeEditorProps {
  code: string | null;
  onChange?: (code: string) => void;
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
  padding: 8px 12px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
`;

const titleStyle = css`
  font-size: 12px;
  font-weight: 600;
  color: #e0e0e0;
`;

const buttonStyle = css`
  padding: 4px 10px;
  background: #00c2e0;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #00a8c5;
  }
`;

const copiedStyle = css`
  ${buttonStyle}
  background: #7dc728;
  &:hover {
    background: #7dc728;
  }
`;

const editorWrapperStyle = css`
  flex: 1;
  overflow: auto;

  .cm-editor {
    height: 100%;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    color: #abb2bf;
  }

  .cm-scroller {
    overflow: auto;
  }

  .cm-gutters {
    border-right: 1px solid #3c3c3c;
  }

  .cm-line {
    color: #abb2bf;
  }
`;

const emptyStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #808080;
  font-size: 13px;
`;

export function CodeEditor({ code, onChange }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);
  // 외부에서 코드가 바뀔 때만 에디터 교체, 내부 편집은 무시
  const isInternalChange = useRef(false);

  // 에디터 초기화
  useEffect(() => {
    if (!editorRef.current || !code) return;

    // 내부 편집으로 인한 code 변경이면 에디터를 재생성하지 않음
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }

    // 기존 에디터 정리
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        isInternalChange.current = true;
        onChange(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        highlightActiveLine(),
        javascript({ jsx: true, typescript: true }),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [code, onChange]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }, [code]);

  return (
    <div css={containerStyle}>
      <div css={headerStyle}>
        <span css={titleStyle}>Generated Code</span>
        <button
          css={copied ? copiedStyle : buttonStyle}
          onClick={handleCopy}
          disabled={!code}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {code ? (
        <div css={editorWrapperStyle} ref={editorRef} />
      ) : (
        <div css={emptyStyle}>
          No code generated yet. Select a component in Figma.
        </div>
      )}
    </div>
  );
}
