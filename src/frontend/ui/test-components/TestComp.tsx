import { useEffect, useRef, useState } from "react";
import { compileReactComponent } from "../utils/component-compiler";
import FigmaCompiler from "@frontend/ui/domain/compiler";
import taptapButtonSample from "../../../../test/fixtures/button/taptapButton_sample.json";
import tadaButtonSample from "../../../../test/fixtures/button/tadaButton.json";
import airtableButton from "../../../../test/fixtures/button/airtableButton.json";
import urockButton from "../../../../test/fixtures/button/urockButton.json";
import taptapButton from "../../../../test/fixtures/button/taptapButton.json";
import dialogFixture from "../../../../test/fixtures/dialog.json";
import paginationFixture from "../../../../test/fixtures/pagination.json";
import selectsFixture from "../../../../test/fixtures/selects.json";

export function TestComp() {
  const [tsxCode, setTsxCode] = useState<string>("");
  const [CompiledComponent, setCompiledComponent] =
    useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // @ts-ignore
  const codeRef = useRef();

  useEffect(() => {
    async function compile() {
      if (codeRef.current) return;
      try {
        setError(null);
        setTsxCode("");
        setCompiledComponent(null);

        console.log("taptapButton");
        // 컴파일러 생성
        const compiler = new FigmaCompiler(taptapButton);
        // codeRef.current = new FigmaCompiler(urockButton);
        // codeRef.current = new FigmaCompiler(taptapButtonSample);
        // codeRef.current = new FigmaCompiler(tadaButtonSample);
        // codeRef.current = new FigmaCompiler(airtableButton);

        // 코드 생성
        const generatedCode = compiler.getGeneratedCode("Button");
        if (!generatedCode) {
          throw new Error("코드 생성 실패");
        }

        setTsxCode(generatedCode);

        // 컴포넌트 컴파일
        const Component = await compileReactComponent(generatedCode);
        setCompiledComponent(() => Component);

        codeRef.current = compiler;
      } catch (err) {
        setError(err instanceof Error ? err.message : "알 수 없는 오류");
        console.error("Compilation error:", err);
      }
    }
    compile();
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
            <CompiledComponent size={"Small"} />
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
