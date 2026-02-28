import { useEffect, useState, useRef } from "react";

import type { FigmaNodeData } from "@code-generator2";
import { useCompilerDebug, StyleStrategyType } from "./useCompilerDebug";
import ErrorBoundary from "@frontend/ui/components/ErrorBoundary";
import CodeViewer from "@frontend/ui/components/CodeViewer";

// twind
import { install, observe, stringify } from "@twind/core";
import twindConfig from "./twind.config";

// Vite의 import.meta.glob으로 모든 JSON 파일 동적 로드
// @ts-expect-error - import.meta.glob is a Vite-specific feature
const fixtureModules = import.meta.glob("../../../../test/fixtures/**/*.json", {
  eager: true,
  import: "default",
}) as Record<string, any>;

// { "../../../../test/fixtures/button/xxx.json": data } → { "xxx": { label, data } }
const FIXTURES: Record<string, { label: string; data: FigmaNodeData }> =
  Object.entries(fixtureModules).reduce(
    (acc, [path, data]) => {
      // 파일명에서 키 추출 (예: "../../../../test/fixtures/button/airtableButton.json" → "airtableButton")
      const fileName = path.split("/").pop()?.replace(".json", "") || "";
      // 폴더명 추출 (예: "button", "chip", "any")
      const folderMatch = path.match(/fixtures\/([^/]+)\//);
      const folder = folderMatch?.[1] || "";

      // 라벨: 폴더명이 있으면 "폴더/파일명" 형태
      const label = folder ? `${folder}/${fileName}` : fileName;

      acc[fileName] = {
        label,
        data: data as FigmaNodeData,
      };
      return acc;
    },
    {} as Record<string, { label: string; data: FigmaNodeData }>
  );

// 키 목록 (드롭다운 정렬용)
const FIXTURE_KEYS = Object.keys(FIXTURES).sort();

export function TestComp() {
  const STORAGE_KEY = "testComp.fixtureKey";
  const STRATEGY_STORAGE_KEY = "testComp.styleStrategy";

  const defaultFixtureKey = FIXTURE_KEYS[0] || "";
  const [fixtureKey, setFixtureKey] = useState<string>(() => {
    if (typeof window === "undefined") return defaultFixtureKey;

    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (saved && saved in FIXTURES) {
      return saved;
    }

    return defaultFixtureKey;
  });

  const [styleStrategy, setStyleStrategy] = useState<StyleStrategyType>(() => {
    if (typeof window === "undefined") return "emotion";

    const saved = window.localStorage.getItem(STRATEGY_STORAGE_KEY);
    if (saved === "emotion" || saved === "tailwind") {
      return saved;
    }
    return "emotion";
  });

  const currentFixture = FIXTURES[fixtureKey];
  const {
    status,
    code,
    Component,
    error,
    compileMs,
    defaultProps: _defaultProps,
  } = useCompilerDebug(currentFixture?.data || null, { styleStrategy });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, fixtureKey);
  }, [fixtureKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STRATEGY_STORAGE_KEY, styleStrategy);
  }, [styleStrategy]);

  // twind 초기화 (Tailwind CDN 대신 런타임 처리)
  const twindInitializedRef = useRef(false);
  
  useEffect(() => {
    if (twindInitializedRef.current) return;
    twindInitializedRef.current = true;

    // twind 설치
    const tw = install(twindConfig);
    
    // DOM 관찰 시작 - className 변경을 자동으로 감지하고 CSS 생성
    observe(tw, document.documentElement);
    
    console.log("twind initialized");
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Transpile 결과</h2>

        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span>Fixture</span>
          <select
            value={fixtureKey}
            onChange={(e) => setFixtureKey(e.target.value)}
          >
            {FIXTURE_KEYS.map((key) => (
              <option key={key} value={key}>
                {FIXTURES[key]?.label || key}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span>Style</span>
          <select
            value={styleStrategy}
            onChange={(e) =>
              setStyleStrategy(e.target.value as StyleStrategyType)
            }
            style={{
              backgroundColor:
                styleStrategy === "tailwind" ? "#06b6d4" : "#db7093",
              color: "white",
              fontWeight: "bold",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "none",
            }}
          >
            <option value="emotion">Emotion</option>
            <option value="tailwind">Tailwind</option>
          </select>
        </label>

        <div style={{ marginLeft: "auto", opacity: 0.8 }}>
          {status === "compiling" && <span>Compiling...</span>}
          {status === "ready" && (
            <span>
              Ready{typeof compileMs === "number" ? ` (${compileMs}ms)` : ""}
            </span>
          )}
          {status === "error" && <span>Error</span>}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#fee",
            color: "#c00",
            marginBottom: "20px",
            borderRadius: "4px",
          }}
        >
          <strong>오류:</strong> {error}
        </div>
      )}

      {Component && (
        <ErrorBoundary>
          <div style={{ marginBottom: "30px" }}>
            <h3>렌더링 결과:</h3>
            <div
              style={{
                padding: "20px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                backgroundColor: "#fff",
              }}
            >
              <Component />
            </div>
          </div>
        </ErrorBoundary>
      )}

      <div style={{ marginBottom: "30px" }}>
        <h3>생성된 TSX 코드:</h3>
        <CodeViewer code={code} />
        {/*<pre*/}
        {/*  style={{*/}
        {/*    backgroundColor: "#f5f5f5",*/}
        {/*    padding: "15px",*/}
        {/*    borderRadius: "4px",*/}
        {/*    overflow: "auto",*/}
        {/*    maxHeight: "400px",*/}
        {/*    fontSize: "12px",*/}
        {/*    lineHeight: "1.4",*/}
        {/*  }}*/}
        {/*>*/}
        {/*  {code || (status === "compiling" ? "로딩 중..." : "")}*/}
        {/*</pre>*/}
      </div>
    </div>
  );
}
