import React, { useEffect, useState, useRef, useCallback } from "react";
import { css } from "@emotion/react";
import { useNavigate } from "react-router-dom";
import useMessageHandler from "./useMessageHandler";
import FigmaCompiler, { PropDefinition } from "@compiler";
import { useComponentRenderer } from "./hooks/useComponentRenderer";
import { PropController } from "./components/PropController";
import { CodeViewer } from "./components/CodeViewer";
import ErrorBoundary from "@frontend/ui/components/ErrorBoundary";

/**
 * SLOT props에 대한 목업 엘리먼트 생성
 */
function createSlotMockup(prop: PropDefinition): React.ReactNode {
  const slotInfo = prop.slotInfo;

  // dependency에 SVG가 있으면 SVG 렌더링
  if (slotInfo?.mockupSvg) {
    return React.createElement("div", {
      key: `slot-mockup-${prop.name}`,
      dangerouslySetInnerHTML: { __html: slotInfo.mockupSvg },
      style: { display: "inline-flex" },
    });
  }

  // SVG가 없으면 기본 placeholder
  const componentName = slotInfo?.componentName || prop.name;
  return React.createElement(
    "div",
    {
      key: `slot-mockup-${prop.name}`,
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 12px",
        border: "2px dashed #0078d4",
        borderRadius: "4px",
        backgroundColor: "rgba(0, 120, 212, 0.1)",
        color: "#0078d4",
        fontSize: "12px",
        fontWeight: 500,
        minWidth: "60px",
        minHeight: "24px",
      },
    },
    `[${componentName}]`
  );
}

// twind는 main.tsx에서 전역 초기화됨

const appContainerStyle = css`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  color: #1a1a1a;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const previewSectionStyle = css`
  flex: 0 0 auto;
  padding: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
`;

const scrollSectionStyle = css`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const previewTitleStyle = css`
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
`;

const previewContainerStyle = css`
  background: white;
  border-radius: 8px;
  margin-bottom: 16px;
  height: 200px;
  overflow: hidden;
  position: relative;
`;

const previewContentStyle = css`
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center center;
  width: max-content;
  height: max-content;
`;

const emptyPreviewStyle = css`
  color: #6b7280;
  font-size: 14px;
`;

const errorStyle = css`
  color: #dc2626;
  font-size: 13px;
  padding: 12px;
  background: rgba(220, 38, 38, 0.1);
  border-radius: 4px;
  margin-bottom: 16px;
`;

const propsControlSectionStyle = css`
  padding: 16px;
  padding-top: 8px;
`;

const codeSectionStyle = css`
  flex: 1;
  padding: 16px;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
`;

const codeHeaderStyle = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const codeTitleStyle = css`
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
`;

const styleToggleStyle = css`
  display: flex;
  gap: 4px;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px;
`;

const styleButtonStyle = css`
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  color: #6b7280;

  &:hover {
    color: #1a1a1a;
  }
`;

const styleButtonActiveStyle = css`
  background: #00c2e0;
  color: #ffffff;
`;

const saveButtonStyle = css`
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  background: #7dc728;
  color: #ffffff;
  transition: all 0.15s ease;

  &:hover {
    background: #6bb020;
  }

  &:disabled {
    background: #e5e7eb;
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

function App() {
  const navigate = useNavigate();
  const { selectionNodeData, scanState, startScan, resetScan } =
    useMessageHandler();

  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [propDefinitions, setPropDefinitions] = useState<PropDefinition[]>([]);
  const [propValues, setPropValues] = useState<Record<string, any>>({});
  const [componentName, setComponentName] = useState<string>("");
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const [scale, setScale] = useState(1);
  const [originalSize, setOriginalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [styleStrategy, setStyleStrategy] = useState<"emotion" | "tailwind">(
    "emotion"
  );
  const [slotMockupEnabled, setSlotMockupEnabled] = useState<
    Record<string, boolean>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);

  // Figma 데이터에서 원본 크기 추출
  useEffect(() => {
    if (selectionNodeData?.info?.document?.absoluteBoundingBox) {
      const bbox = selectionNodeData.info.document.absoluteBoundingBox;
      setOriginalSize({ width: bbox.width, height: bbox.height });
    } else {
      setOriginalSize(null);
    }
  }, [selectionNodeData]);

  // 컨테이너에 맞춰 자동 스케일 계산
  const updateAutoScale = useCallback(() => {
    const container = previewContainerRef.current;

    if (!container) {
      setScale(1);
      return;
    }

    // 원본 크기가 있으면 그것을 사용, 없으면 DOM에서 측정
    let contentWidth: number;
    let contentHeight: number;

    if (originalSize) {
      contentWidth = originalSize.width;
      contentHeight = originalSize.height;
    } else {
      const content = previewContentRef.current;
      if (!content) {
        setScale(1);
        return;
      }
      content.style.transform = "translate(-50%, -50%) scale(1)";
      void content.offsetHeight;
      const renderedChild = content.firstElementChild as HTMLElement;
      contentWidth = renderedChild?.offsetWidth || content.scrollWidth;
      contentHeight = renderedChild?.offsetHeight || content.scrollHeight;
    }

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // 패딩 여유
    const padding = 32;
    const availableWidth = containerWidth - padding;
    const availableHeight = containerHeight - padding;

    if (contentWidth === 0 || contentHeight === 0) {
      setScale(1);
      return;
    }

    // 컨테이너에 맞춰 스케일 계산 (최대 1)
    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    const fitScale = Math.min(scaleX, scaleY, 1);

    setScale(fitScale);
  }, [originalSize]);

  // FigmaCompiler로 코드 생성
  useEffect(() => {
    // selectionNodeData가 변경될 때마다 상태 리셋
    setErrorBoundaryKey((prev) => prev + 1);
    setGeneratedCode(null);

    if (!selectionNodeData) {
      setPropDefinitions([]);
      setPropValues({});
      setComponentName("");
      return;
    }

    try {
      const figmaCompiler = new FigmaCompiler(selectionNodeData, {
        styleStrategy: { type: styleStrategy },
      });
      const name = figmaCompiler.getComponentName();
      setComponentName(name);

      // Props 정의 가져오기
      const props = figmaCompiler.getPropsDefinition();
      setPropDefinitions(props);

      // Props 초기값 설정 (SLOT에는 목업 주입)
      const initialValues: Record<string, any> = {};
      const initialSlotEnabled: Record<string, boolean> = {};
      props.forEach((prop) => {
        if (prop.type === "SLOT") {
          // mockupSvg가 있는 경우에만 기본 활성화 (placeholder 방지)
          const hasMockup = !!prop.slotInfo?.mockupSvg;
          initialSlotEnabled[prop.name] = hasMockup;
          initialValues[prop.name] = hasMockup ? createSlotMockup(prop) : null;
        } else {
          initialValues[prop.name] = prop.defaultValue;
        }
      });
      setSlotMockupEnabled(initialSlotEnabled);
      setPropValues(initialValues);

      // 코드 생성
      figmaCompiler.getGeneratedCode(name).then((code) => {
        setGeneratedCode(code);
      });
    } catch (e) {
      console.error("FigmaCompiler error:", e);
    }
  }, [selectionNodeData, styleStrategy]);

  // 동적 컴포넌트 렌더러
  const { Component, error, isLoading } = useComponentRenderer(generatedCode);

  // Component가 렌더링되거나 props가 변경되면 자동 스케일 업데이트
  useEffect(() => {
    if (Component && !isLoading && !error) {
      // 렌더링 완료 후 스케일 계산 (약간의 딜레이)
      const timer = setTimeout(() => {
        updateAutoScale();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [Component, isLoading, error, propValues, updateAutoScale]);

  // Prop 변경 핸들러
  const handlePropChange = (name: string, value: any) => {
    setPropValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // SLOT 목업 토글 핸들러
  const handleSlotMockupToggle = (name: string, enabled: boolean) => {
    setSlotMockupEnabled((prev) => ({
      ...prev,
      [name]: enabled,
    }));

    // 해당 prop 값 업데이트
    const propDef = propDefinitions.find((p) => p.name === name);
    if (propDef) {
      setPropValues((prev) => ({
        ...prev,
        [name]: enabled ? createSlotMockup(propDef) : null,
      }));
    }
  };

  // 스캔 상태 텍스트
  const getScanStatusText = () => {
    if (scanState.isScanning) {
      return `스캔 중... ${scanState.current}/${scanState.total}`;
    }
    if (scanState.total > 0) {
      return `완료: ${scanState.succeeded}개 성공, ${scanState.failed}개 실패`;
    }
    return "";
  };

  // 로컬 failing 폴더에 저장 (dev 전용)
  const saveToFailing = async () => {
    if (!selectionNodeData || !componentName) {
      setSaveStatus("No data to save");
      return;
    }

    setIsSaving(true);
    setSaveStatus("Exporting image...");

    try {
      // 1. Figma에서 이미지 요청
      const imageBase64 = await new Promise<string | null>((resolve) => {
        const handler = (event: MessageEvent) => {
          const msg = event.data.pluginMessage;
          if (msg?.type === "selection-image-result") {
            window.removeEventListener("message", handler);
            resolve(msg.imageBase64);
          }
        };
        window.addEventListener("message", handler);

        // 3초 타임아웃
        setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve(null);
        }, 3000);

        // 이미지 요청 전송
        parent.postMessage(
          { pluginMessage: { type: "export-selection-image" } },
          "*"
        );
      });

      setSaveStatus("Saving...");

      // 2. 파일명 안전하게 처리 (공백 → 언더스코어)
      const safeName = componentName.replace(/\s+/g, "_");

      // 3. 서버에 저장
      const response = await fetch("http://localhost:5173/api/save-failing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: safeName,
          nodeData: selectionNodeData,
          imageBase64: imageBase64,
        }),
      });

      if (response.ok) {
        setSaveStatus(`✅ Saved: ${componentName}`);
      } else {
        const error = await response.text();
        setSaveStatus(`❌ Error: ${error}`);
      }
    } catch (e) {
      setSaveStatus(`❌ Failed: ${(e as Error).message}`);
    } finally {
      setIsSaving(false);
      // 3초 후 상태 메시지 제거
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  return (
    <div css={appContainerStyle}>
      {/* 상단 고정: Preview */}
      <div css={previewSectionStyle}>
        <div
          css={previewTitleStyle}
          style={{ display: "flex", alignItems: "center", gap: "12px" }}
        >
          <span>Preview {componentName && `- ${componentName}`}</span>

          {/* Dev 전용: Save to Failing 버튼 */}
          {selectionNodeData && (
            <button
              css={saveButtonStyle}
              onClick={saveToFailing}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "💾 Save to Failing"}
            </button>
          )}

          {saveStatus && (
            <span
              style={{
                fontSize: "11px",
                color: saveStatus.startsWith("✅") ? "#7dc728" : "#dc2626",
              }}
            >
              {saveStatus}
            </span>
          )}

          <span
            style={{ marginLeft: "auto", fontSize: "11px", color: "#6b7280" }}
          >
            {getScanStatusText()}
          </span>
        </div>

        <ErrorBoundary key={errorBoundaryKey}>
          <div ref={previewContainerRef} css={previewContainerStyle}>
            <div
              ref={previewContentRef}
              css={previewContentStyle}
              style={{
                transform: `translate(-50%, -50%) scale(${scale})`,
                ...(originalSize && {
                  width: `${originalSize.width}px`,
                  height: `${originalSize.height}px`,
                }),
              }}
            >
              {isLoading && <span css={emptyPreviewStyle}>Loading...</span>}

              {error && <div css={errorStyle}>Error: {error}</div>}

              {!isLoading && !error && Component && (
                <Component {...propValues} />
              )}

              {!isLoading && !error && !Component && (
                <span css={emptyPreviewStyle}>
                  Select a component in Figma to preview
                </span>
              )}
            </div>
          </div>
        </ErrorBoundary>
      </div>

      {/* 스크롤 영역: Props Control + Generated Code */}
      <div css={scrollSectionStyle}>
        {propDefinitions.length > 0 && (
          <div css={propsControlSectionStyle}>
            <PropController
              slotMockupEnabled={slotMockupEnabled}
              onSlotMockupToggle={handleSlotMockupToggle}
              propDefinitions={propDefinitions}
              propValues={propValues}
              onPropChange={handlePropChange}
            />
          </div>
        )}

        <div css={codeSectionStyle}>
          <div css={codeHeaderStyle}>
            <span css={codeTitleStyle}>Generated Code</span>
            <div css={styleToggleStyle}>
              <button
                css={[
                  styleButtonStyle,
                  styleStrategy === "emotion" && styleButtonActiveStyle,
                ]}
                onClick={() => setStyleStrategy("emotion")}
              >
                Emotion
              </button>
              <button
                css={[
                  styleButtonStyle,
                  styleStrategy === "tailwind" && styleButtonActiveStyle,
                ]}
                onClick={() => setStyleStrategy("tailwind")}
              >
                Tailwind
              </button>
            </div>
          </div>
          <CodeViewer code={generatedCode} />
        </div>
      </div>
    </div>
  );
}

export default App;
