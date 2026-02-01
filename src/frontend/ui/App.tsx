import React, { useEffect, useState, useRef, useCallback } from "react";
import { css } from "@emotion/react";
import { useNavigate } from "react-router-dom";
import useMessageHandler from "./useMessageHandler";
import FigmaCodeGenerator, { PropDefinition } from "@compiler";
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

  // 실제 크기로 반투명 + 점선 placeholder
  const componentName = slotInfo?.componentName || prop.name;
  const width = slotInfo?.width;
  const height = slotInfo?.height;

  return React.createElement(
    "div",
    {
      key: `slot-mockup-${prop.name}`,
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: width ? `${width}px` : "auto",
        height: height ? `${height}px` : "auto",
        minWidth: width ? undefined : "60px",
        minHeight: height ? undefined : "24px",
        padding: width && height ? undefined : "8px 12px",
        border: "1px dashed rgba(0, 120, 212, 0.5)",
        borderRadius: "4px",
        backgroundColor: "rgba(0, 120, 212, 0.08)",
        color: "rgba(0, 120, 212, 0.6)",
        fontSize: "11px",
        fontWeight: 500,
        boxSizing: "border-box",
      },
    },
    `Slot: ${componentName}`
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
  const { selectionNodeData } = useMessageHandler();

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

    // 항상 DOM에서 실제 렌더링된 크기를 계산 (gap으로 인한 overflow 포함)
    let contentWidth: number;
    let contentHeight: number;

    {
      const content = previewContentRef.current;
      if (!content) {
        setScale(1);
        return;
      }
      content.style.transform = "translate(-50%, -50%) scale(1)";
      void content.offsetHeight;
      const renderedChild = content.firstElementChild as HTMLElement;

      // 실제 컨텐츠 크기 계산: flexbox의 자식들 + gap 값 포함
      const calculateActualWidth = (el: HTMLElement): number => {
        const style = getComputedStyle(el);
        const display = style.display;

        // flex container인 경우 자식들의 실제 크기 + gap 계산
        if (display === "flex" || display === "inline-flex") {
          const gap = parseInt(style.gap, 10) || 0;
          const flexDirection = style.flexDirection;
          const children = Array.from(el.children) as HTMLElement[];

          if (flexDirection === "row" || flexDirection === "row-reverse") {
            // 가로 방향: 자식 너비 합 + gap
            let totalWidth = 0;
            children.forEach((child, i) => {
              totalWidth += child.offsetWidth;
              if (i < children.length - 1) totalWidth += gap;
            });
            // padding 추가
            totalWidth += parseInt(style.paddingLeft, 10) || 0;
            totalWidth += parseInt(style.paddingRight, 10) || 0;
            return Math.max(totalWidth, el.offsetWidth);
          }
        }

        // 재귀적으로 자식 탐색
        let maxChildWidth = el.offsetWidth;
        Array.from(el.children).forEach((child) => {
          const childWidth = calculateActualWidth(child as HTMLElement);
          maxChildWidth = Math.max(maxChildWidth, childWidth);
        });

        return maxChildWidth;
      };

      if (renderedChild) {
        contentWidth = calculateActualWidth(renderedChild);
        contentHeight = renderedChild.offsetHeight;
      } else {
        contentWidth = content.scrollWidth;
        contentHeight = content.scrollHeight;
      }
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

    // 컴포넌트에 직접 transform 적용 (overflow: hidden 문제 해결)
    const content = previewContentRef.current;
    if (content) {
      const renderedChild = content.firstElementChild as HTMLElement;
      if (renderedChild && fitScale < 1) {
        renderedChild.style.transform = `scale(${fitScale})`;
        renderedChild.style.transformOrigin = "top left";
      }
    }

    setScale(fitScale);
  }, [originalSize]);

  // FigmaCodeGenerator로 코드 생성
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
      const codeGenerator = new FigmaCodeGenerator(selectionNodeData, {
        styleStrategy: { type: styleStrategy },
      });
      const name = codeGenerator.getComponentName();
      setComponentName(name);

      // Props 정의 가져오기
      const props = codeGenerator.getPropsDefinition();
      setPropDefinitions(props);

      // Props 초기값 설정 (SLOT에는 목업 주입)
      const initialValues: Record<string, any> = {};
      const initialSlotEnabled: Record<string, boolean> = {};
      props.forEach((prop) => {
        if (prop.type === "SLOT") {
          // 모든 SLOT에 대해 mockup 기본 활성화 (점선 박스 placeholder 표시)
          initialSlotEnabled[prop.name] = true;
          initialValues[prop.name] = createSlotMockup(prop);
        } else {
          initialValues[prop.name] = prop.defaultValue;
        }
      });
      setSlotMockupEnabled(initialSlotEnabled);
      setPropValues(initialValues);

      // 코드 생성
      codeGenerator.getGeneratedCode(name).then((code) => {
        setGeneratedCode(code);
      });
    } catch (e) {
      console.error("FigmaCodeGenerator error:", e);
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

          {/* Dev 전용: Save to Failing 버튼 (build:dev에서만 표시) */}
          {__DEV_BUILD__ && selectionNodeData && (
            <button
              css={saveButtonStyle}
              onClick={saveToFailing}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "💾 Save to Failing"}
            </button>
          )}

          {__DEV_BUILD__ && saveStatus && (
            <span
              style={{
                fontSize: "11px",
                color: saveStatus.startsWith("✅") ? "#7dc728" : "#dc2626",
              }}
            >
              {saveStatus}
            </span>
          )}
        </div>

        <ErrorBoundary key={errorBoundaryKey}>
          <div ref={previewContainerRef} css={previewContainerStyle}>
            <div
              ref={previewContentRef}
              css={previewContentStyle}
              style={{
                // transform은 자식 컴포넌트에 직접 적용됨 (updateAutoScale에서)
                transform: "translate(-50%, -50%)",
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
