import { useState, useEffect } from "react";
import taptabpButton from "../domain/transpiler/assets/taptapButton.json";
// import selects from "../domain/transpiler/assets/selects.json";
import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { transpile } from "../domain/transpiler/pipeline/transpiler";
import { compileReactComponent } from "../utils/component-compiler";

export function TestComp() {
  const [tsxCode, setTsxCode] = useState<string>("");
  const [CompiledComponent, setCompiledComponent] =
    useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const componentSpec = taptabpButton as ComponentSetNodeSpec;
      const code = transpile(componentSpec);
      setTsxCode(code);

      // 컴파일해서 렌더링도 시도
      try {
        const Component = compileReactComponent(code);
        console.log(Component);
        setCompiledComponent(() => Component);
        setError(null);
      } catch (compileError) {
        setError(
          compileError instanceof Error ? compileError.message : "컴파일 실패",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h2>Transpile 결과</h2>

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

      {CompiledComponent && (
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
            <CompiledComponent text={11} />
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
          {tsxCode || "로딩 중..."}
        </pre>
      </div>
    </div>
  );
}
