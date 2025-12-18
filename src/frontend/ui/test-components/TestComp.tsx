import { useMemo, useState } from "react";

import taptapButtonSample from "../../../../test/fixtures/button/taptapButton_sample.json";
import tadaButtonSample from "../../../../test/fixtures/button/tadaButton.json";
import airtableButton from "../../../../test/fixtures/button/airtableButton.json";
import urockButton from "../../../../test/fixtures/button/urockButton.json";
import taptapButton from "../../../../test/fixtures/button/taptapButton.json";

import type { FigmaNodeData } from "@compiler/types/baseType";
import { useCompilerDebug } from "./useCompilerDebug";

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
      }) as const,
    []
  );

  type FixtureKey = keyof typeof FIXTURES;
  const [fixtureKey, setFixtureKey] = useState<FixtureKey>("taptapButton");

  const { status, code, Component, error, compileMs, defaultProps } =
    useCompilerDebug(FIXTURES[fixtureKey].data);

  console.log(defaultProps);
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
