import { useEffect, useRef, useState } from "react";
import { compileReactComponent } from "../utils/component-compiler";
import FigmaCompiler from "@frontend/ui/domain/compiler";
import taptapButtonSample from "../../../../test/fixtures/button/taptapButton_sample.json";

export function TestComp() {
  const [tsxCode, setTsxCode] = useState<string>("");
  const [CompiledComponent, setCompiledComponent] =
    useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const codeRef = useRef();

  useEffect(() => {
    async function compile() {
      if (codeRef.current) return;
      try {
        codeRef.current = new FigmaCompiler(taptapButtonSample);
        return;
        setTsxCode(codeRef.current);

        // 컴파일해서 렌더링도 시도
        try {
          const Component = await compileReactComponent(code);
          setCompiledComponent(() => Component);
          setError(null);
        } catch (compileError) {
          setError(
            compileError instanceof Error ? compileError.message : "컴파일 실패"
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "알 수 없는 오류");
      }
    }
    compile();
  }, [codeRef]);

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
            <CompiledComponent text={"Test"} size={"small"} />
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
