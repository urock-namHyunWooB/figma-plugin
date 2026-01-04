import { useEffect, useMemo, useState } from "react";

import taptapButtonSample from "../../../../test/fixtures/button/taptapButton_sample.json";
import tadaButtonSample from "../../../../test/fixtures/button/tadaButton.json";
import airtableButton from "../../../../test/fixtures/button/airtableButton.json";
import urockButton from "../../../../test/fixtures/button/urockButton.json";
import taptapButton from "../../../../test/fixtures/button/taptapButton.json";
import urockChips from "../../../../test/fixtures/chip/urock-chips.json";
import airtableSelectButton from "../../../../test/fixtures/select-button/airtable-select-button.json";

import type { FigmaNodeData } from "@compiler/types/baseType";
import { useCompilerDebug } from "./useCompilerDebug";
import ErrorBoundary from "@frontend/ui/components/ErrorBoundary";

export function TestComp() {
  const FIXTURES = useMemo(
    () =>
      ({
        taptapButton: {
          label: "taptapButton",
          data: taptapButton as unknown as FigmaNodeData,
        },
        urockButton: {
          label: "urockButton",
          data: urockButton as unknown as FigmaNodeData,
        },
        taptapButtonSample: {
          label: "taptapButton_sample",
          data: taptapButtonSample as unknown as FigmaNodeData,
        },
        tadaButton: {
          label: "tadaButton",
          data: tadaButtonSample as unknown as FigmaNodeData,
        },
        airtableButton: {
          label: "airtableButton",
          data: airtableButton as unknown as FigmaNodeData,
        },
        urockChips: {
          label: "urockChips",
          data: urockChips as unknown as FigmaNodeData,
        },
        airtableSelectButton: {
          label: "airtableSelectButton",
          data: airtableSelectButton as unknown as FigmaNodeData,
        },
      }) as const,
    []
  );

  const STORAGE_KEY = "testComp.fixtureKey";

  type FixtureKey = keyof typeof FIXTURES;
  const [fixtureKey, setFixtureKey] = useState<FixtureKey>(() => {
    if (typeof window === "undefined") return "taptapButton";

    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (saved && saved in FIXTURES) {
      return saved as FixtureKey;
    }

    return "taptapButton";
  });

  const { status, code, Component, error, compileMs, defaultProps } =
    useCompilerDebug(FIXTURES[fixtureKey].data);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, fixtureKey);
  }, [fixtureKey]);

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Transpile 결과</h2>

        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span>Fixture</span>
          <select
            value={fixtureKey}
            onChange={(e) => setFixtureKey(e.target.value as FixtureKey)}
          >
            {Object.entries(FIXTURES).map(([key, f]) => (
              <option key={key} value={key}>
                {f.label}
              </option>
            ))}
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
        <pre
          style={{
            backgroundColor: "#f5f5f5",
            padding: "15px",
            borderRadius: "4px",
            overflow: "auto",
            maxHeight: "400px",
            fontSize: "12px",
            lineHeight: "1.4",
          }}
        >
          {code || (status === "compiling" ? "로딩 중..." : "")}
        </pre>
      </div>
    </div>
  );
}
