import { useEffect, useState } from "react";
import { css } from "@emotion/react";
import useMessageHandler from "./useMessageHandler";
import FigmaCompiler, { PropDefinition } from "@compiler";
import { useComponentRenderer } from "./hooks/useComponentRenderer";
import { PropController } from "./components/PropController";
import { CodeViewer } from "./components/CodeViewer";

import tadaButtonSample from "../../../test/fixtures/button/tadaButton.json";

const appContainerStyle = css`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #121212;
  color: #e0e0e0;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const topSectionStyle = css`
  flex: 0 0 auto;
  padding: 16px;
  border-bottom: 1px solid #2d2d2d;
  overflow: auto;
  max-height: 60vh;
`;

const previewContainerStyle = css`
  background: #1e1e1e;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 16px;
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const previewTitleStyle = css`
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 12px;
`;

const emptyPreviewStyle = css`
  color: #808080;
  font-size: 14px;
`;

const errorStyle = css`
  color: #f44336;
  font-size: 13px;
  padding: 12px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 4px;
  margin-bottom: 16px;
`;

const bottomSectionStyle = css`
  flex: 1;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

function App() {
  const { selectionNodeData } = useMessageHandler();

  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [propDefinitions, setPropDefinitions] = useState<PropDefinition[]>([]);
  const [propValues, setPropValues] = useState<Record<string, any>>({});
  const [componentName, setComponentName] = useState<string>("");

  // FigmaCompiler로 코드 생성
  useEffect(() => {
    if (!selectionNodeData) {
      setGeneratedCode(null);
      setPropDefinitions([]);
      setPropValues({});
      setComponentName("");
      return;
    }

    const figmaCompiler = new FigmaCompiler(selectionNodeData);
    const name = figmaCompiler.getComponentName();
    setComponentName(name);

    // Props 정의 가져오기
    const props = figmaCompiler.getPropsDefinition();
    setPropDefinitions(props);

    // Props 초기값 설정
    const initialValues: Record<string, any> = {};
    props.forEach((prop) => {
      initialValues[prop.name] = prop.defaultValue;
    });
    setPropValues(initialValues);

    // 코드 생성
    figmaCompiler.getGeneratedCode(name).then((code) => {
      setGeneratedCode(code);
    });
  }, [selectionNodeData]);

  // 동적 컴포넌트 렌더러
  const { Component, error, isLoading } = useComponentRenderer(generatedCode);

  // Prop 변경 핸들러
  const handlePropChange = (name: string, value: any) => {
    setPropValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div css={appContainerStyle}>
      {/* 상단: Preview + Props Control */}
      <div css={topSectionStyle}>
        <div css={previewTitleStyle}>
          Preview {componentName && `- ${componentName}`}
        </div>

        <div css={previewContainerStyle}>
          {isLoading && <span css={emptyPreviewStyle}>Loading...</span>}

          {error && <div css={errorStyle}>Error: {error}</div>}

          {!isLoading && !error && Component && <Component {...propValues} />}

          {!isLoading && !error && !Component && (
            <span css={emptyPreviewStyle}>
              Select a component in Figma to preview
            </span>
          )}
        </div>

        {propDefinitions.length > 0 && (
          <PropController
            propDefinitions={propDefinitions}
            propValues={propValues}
            onPropChange={handlePropChange}
          />
        )}
      </div>

      {/* 하단: Generated Code */}
      <div css={bottomSectionStyle}>
        <CodeViewer code={generatedCode} />
      </div>
    </div>
  );
}

export default App;
