import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useNavigate } from "react-router-dom";
import useMessageHandler from "./useMessageHandler";
import FigmaCodeGenerator, { type PropDefinition } from "@code-generator2";
import { useComponentRenderer } from "./hooks/useComponentRenderer";
import { PropController } from "./components/PropController";
import { CodeEditor } from "./components/CodeEditor";
import { PropsMatrix } from "./components/PropsMatrix";
import ErrorBoundary from "@frontend/ui/components/ErrorBoundary";
import { PublishTab } from "./components/PublishTab";
import { ReleaseSection } from "./components/ReleaseSection";
import { wireFunctionProps } from "./utils/wireFunctionProps";

declare const __DEV_BUILD__: boolean;

type TabId = "preview" | "variants" | "code" | "publish" | "release";

const TAB_SIZES: Record<TabId, { width: number; height: number }> = {
  preview: { width: 400, height: 1000 },
  variants: { width: 900, height: 1000 },
  code: { width: 400, height: 1000 },
  publish: { width: 400, height: 1000 },
  release: { width: 400, height: 1000 },
};

const TAB_LABELS: Record<TabId, string> = {
  preview: "Preview",
  variants: "Variants",
  code: "Code",
  publish: "Publish",
  release: "Release",
};

function resizePluginUI(width: number, height: number) {
  parent.postMessage(
    { pluginMessage: { type: "resize-ui", width, height } },
    "*"
  );
}

/**
 * SLOT props에 대한 목업 엘리먼트 생성
 */
function createSlotMockup(prop: PropDefinition): React.ReactNode {
  const slotInfo = prop.slotInfo;

  if (slotInfo?.mockupSvg) {
    return React.createElement("div", {
      key: `slot-mockup-${prop.name}`,
      dangerouslySetInnerHTML: { __html: slotInfo.mockupSvg },
      style: { display: "inline-flex" },
    });
  }

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

// ─── Styles ────────────────────────────────────────────────

const appStyle = css`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  color: #1a1a1a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const headerStyle = css`
  flex: 0 0 auto;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const headerLeftStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const componentNameStyle = css`
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const headerRightStyle = css`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const styleToggleStyle = css`
  display: flex;
  gap: 2px;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px;
`;

const styleButtonStyle = css`
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  color: #6b7280;
  &:hover { color: #1a1a1a; }
`;

const styleButtonActiveStyle = css`
  background: #00c2e0;
  color: #ffffff;
`;

const tabBarStyle = css`
  flex: 0 0 auto;
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 16px;
  gap: 0;
`;

const tabStyle = css`
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover { color: #1a1a1a; }
`;

const tabActiveStyle = css`
  color: #1a1a1a;
  border-bottom-color: #00c2e0;
`;

const tabContentStyle = css`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

// Preview tab
const previewContainerStyle = css`
  background: white;
  border-radius: 8px;
  margin: 16px;
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

const emptyStyle = css`
  color: #6b7280;
  font-size: 13px;
  text-align: center;
  padding: 24px;
`;

const errorStyle = css`
  color: #dc2626;
  font-size: 13px;
  padding: 12px;
  margin: 16px;
  background: rgba(220, 38, 38, 0.1);
  border-radius: 4px;
`;

const propsControlSectionStyle = css`
  padding: 0 16px 16px;
`;

// Code tab
const codeTabStyle = css`
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

// Dev
const saveButtonStyle = css`
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  background: #7dc728;
  color: #ffffff;
  transition: all 0.15s ease;
  &:hover { background: #6bb020; }
  &:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
`;

// ─── Component ─────────────────────────────────────────────

function App() {
  const navigate = useNavigate();
  const { selectionNodeData, setSelectionNodeData } = useMessageHandler();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        setSelectionNodeData(data);
      } catch (err) {
        console.error("Invalid JSON:", err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [setSelectionNodeData]);

  const [activeTab, setActiveTab] = useState<TabId>("preview");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [propDefinitions, setPropDefinitions] = useState<PropDefinition[]>([]);
  const [propValues, setPropValues] = useState<Record<string, any>>({});
  const [componentName, setComponentName] = useState<string>("");
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const [scale, setScale] = useState(1);
  const [originalSize, setOriginalSize] = useState<{ width: number; height: number } | null>(null);
  const [styleStrategy, setStyleStrategy] = useState<"emotion" | "tailwind">("emotion");
  const [slotMockupEnabled, setSlotMockupEnabled] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [editedCode, setEditedCode] = useState<string | null>(null);
  const [deployCodes, setDeployCodes] = useState<{ emotion: string; tailwind: string } | null>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);

  // 탭 전환 시 패널 리사이즈
  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const size = TAB_SIZES[tab];
    resizePluginUI(size.width, size.height);
  }, []);

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
    if (!container) { setScale(1); return; }

    const content = previewContentRef.current;
    if (!content) { setScale(1); return; }

    content.style.transform = "translate(-50%, -50%) scale(1)";
    void content.offsetHeight;
    const renderedChild = content.firstElementChild as HTMLElement;

    let contentWidth: number;
    let contentHeight: number;

    if (renderedChild) {
      contentWidth = renderedChild.offsetWidth;
      contentHeight = renderedChild.offsetHeight;
    } else {
      contentWidth = content.scrollWidth;
      contentHeight = content.scrollHeight;
    }

    const padding = 32;
    const availableWidth = container.clientWidth - padding;
    const availableHeight = container.clientHeight - padding;

    if (contentWidth === 0 || contentHeight === 0) { setScale(1); return; }

    const fitScale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1);

    if (content) {
      const child = content.firstElementChild as HTMLElement;
      if (child && fitScale < 1) {
        child.style.transform = `scale(${fitScale})`;
        child.style.transformOrigin = "top left";
      }
    }
    setScale(fitScale);
  }, [originalSize]);

  // FigmaCodeGenerator로 코드 생성
  useEffect(() => {
    setErrorBoundaryKey((prev) => prev + 1);
    setGeneratedCode(null);

    if (!selectionNodeData) {
      setPropDefinitions([]);
      setPropValues({});
      setComponentName("");
      setDeployCodes(null);
      return;
    }

    try {
      const codeGenerator = new FigmaCodeGenerator(selectionNodeData, {
        styleStrategy: { type: styleStrategy },
      });
      const name = codeGenerator.getComponentName();
      setComponentName(name);

      const props = codeGenerator.getPropsDefinition();
      setPropDefinitions(props);

      const initialValues: Record<string, any> = {};
      const initialSlotEnabled: Record<string, boolean> = {};
      props.forEach((prop) => {
        if (prop.type === "SLOT") {
          initialSlotEnabled[prop.name] = true;
          initialValues[prop.name] = createSlotMockup(prop);
        } else {
          initialValues[prop.name] = prop.defaultValue;
        }
      });
      wireFunctionProps(initialValues, props, setPropValues);
      setSlotMockupEnabled(initialSlotEnabled);
      setPropValues(initialValues);

      // 프리뷰용 코드 생성 (현재 선택된 전략)
      codeGenerator.compile().then((code) => {
        setGeneratedCode(code);
        setEditedCode(null);
      });

      // 배포용: emotion + tailwind 둘 다 생성
      const otherStrategy = styleStrategy === "emotion" ? "tailwind" : "emotion";
      const otherGenerator = new FigmaCodeGenerator(selectionNodeData, {
        styleStrategy: { type: otherStrategy },
      });
      Promise.all([
        codeGenerator.compile(),
        otherGenerator.compile(),
      ]).then(([currentCode, otherCode]) => {
        setDeployCodes(
          styleStrategy === "emotion"
            ? { emotion: currentCode, tailwind: otherCode }
            : { emotion: otherCode, tailwind: currentCode }
        );
      });
    } catch (e) {
      console.error("FigmaCodeGenerator error:", e);
    }
  }, [selectionNodeData, styleStrategy]);

  // 동적 컴포넌트 렌더러
  const activeCode = editedCode ?? generatedCode;
  const { Component, error, isLoading } = useComponentRenderer(activeCode);

  // 코드 편집 핸들러 (debounce 500ms)
  const handleCodeChange = useCallback((newCode: string) => {
    if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
    editDebounceRef.current = setTimeout(() => {
      setEditedCode(newCode);
    }, 500);
  }, []);

  // PropsMatrix에 넘길 고정 props (SLOT/TEXT/function)
  const fixedProps = useMemo(() => {
    const fixed: Record<string, any> = {};
    propDefinitions.forEach((p) => {
      if (p.type === "SLOT" || p.type === "TEXT" || p.type === "function") {
        fixed[p.name] = propValues[p.name];
      }
    });
    return fixed;
  }, [propDefinitions, propValues]);

  // Preview 탭: 스케일 업데이트
  useEffect(() => {
    if (activeTab === "preview" && Component && !isLoading && !error) {
      const timer = setTimeout(() => updateAutoScale(), 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, Component, isLoading, error, propValues, updateAutoScale]);

  const handlePropChange = (name: string, value: any) => {
    setPropValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSlotMockupToggle = (name: string, enabled: boolean) => {
    setSlotMockupEnabled((prev) => ({ ...prev, [name]: enabled }));
    const propDef = propDefinitions.find((p) => p.name === name);
    if (propDef) {
      setPropValues((prev) => ({
        ...prev,
        [name]: enabled ? createSlotMockup(propDef) : null,
      }));
    }
  };

  // Dev: Save to Failing
  const saveToFailing = async () => {
    if (!selectionNodeData || !componentName) return;
    setIsSaving(true);
    setSaveStatus("Exporting...");
    try {
      const imageBase64 = await new Promise<string | null>((resolve) => {
        const handler = (event: MessageEvent) => {
          const msg = event.data.pluginMessage;
          if (msg?.type === "selection-image-result") {
            window.removeEventListener("message", handler);
            resolve(msg.imageBase64);
          }
        };
        window.addEventListener("message", handler);
        setTimeout(() => { window.removeEventListener("message", handler); resolve(null); }, 3000);
        parent.postMessage({ pluginMessage: { type: "export-selection-image" } }, "*");
      });
      const safeName = componentName.replace(/\s+/g, "_");
      const response = await fetch("http://localhost:5173/api/save-failing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: safeName, nodeData: selectionNodeData, imageBase64 }),
      });
      setSaveStatus(response.ok ? `Saved: ${componentName}` : `Error`);
    } catch (e) {
      setSaveStatus(`Failed`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  return (
    <div css={appStyle}>
      {/* ─── Header ─── */}
      <div css={headerStyle}>
        <div css={headerLeftStyle}>
          <span css={componentNameStyle}>
            {componentName || "CodeMate"}
          </span>
          {__DEV_BUILD__ && (
            <>
              {selectionNodeData && (
                <button css={saveButtonStyle} onClick={saveToFailing} disabled={isSaving}>
                  {isSaving ? "..." : "Save"}
                </button>
              )}
              <button css={saveButtonStyle} onClick={() => fileInputRef.current?.click()}>
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={handleImportJson}
              />
            </>
          )}
        </div>
        <div css={headerRightStyle}>
          <div css={styleToggleStyle}>
            <button
              css={[styleButtonStyle, styleStrategy === "emotion" && styleButtonActiveStyle]}
              onClick={() => setStyleStrategy("emotion")}
            >
              Emotion
            </button>
            <button
              css={[styleButtonStyle, styleStrategy === "tailwind" && styleButtonActiveStyle]}
              onClick={() => setStyleStrategy("tailwind")}
            >
              Tailwind
            </button>
          </div>
        </div>
      </div>

      {/* ─── Tab Bar ─── */}
      <div css={tabBarStyle}>
        {(["preview", "variants", "code", "publish", "release"] as TabId[]).map((tab) => (
          <button
            key={tab}
            css={[tabStyle, activeTab === tab && tabActiveStyle]}
            onClick={() => handleTabChange(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      <div css={tabContentStyle}>
        {/* Preview Tab */}
        {activeTab === "preview" && (
          <>
            <ErrorBoundary key={errorBoundaryKey}>
              <div ref={previewContainerRef} css={previewContainerStyle}>
                <div
                  ref={previewContentRef}
                  css={previewContentStyle}
                  style={{ transform: "translate(-50%, -50%)" }}
                >
                  {isLoading && <span css={emptyStyle}>Loading...</span>}
                  {error && <div css={errorStyle}>Error: {error}</div>}
                  {!isLoading && !error && Component && <Component {...propValues} />}
                  {!isLoading && !error && !Component && (
                    <span css={emptyStyle}>Select a component in Figma</span>
                  )}
                </div>
              </div>
            </ErrorBoundary>
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
          </>
        )}

        {/* Variants Tab */}
        {activeTab === "variants" && (
          <div style={{ padding: 16 }}>
            <PropsMatrix
              Component={Component}
              propDefinitions={propDefinitions}
              fixedProps={fixedProps}
              isLoading={isLoading}
              error={error}
            />
          </div>
        )}

        {/* Code Tab */}
        {activeTab === "code" && (
          <div css={codeTabStyle}>
            <CodeEditor code={generatedCode} onChange={handleCodeChange} />
          </div>
        )}

        {/* Publish Tab — 항상 mount, 탭 전환 시 숨김 (deploy 상태 유지) */}
        <div style={{ display: activeTab === "publish" ? "block" : "none" }}>
          <PublishTab componentName={componentName} generatedCode={generatedCode} deployCodes={deployCodes} figmaNodeId={selectionNodeData?.info?.document?.id} />
        </div>

        {/* Release Tab — 항상 mount, 폴링 상태 유지 */}
        <div style={{ display: activeTab === "release" ? "block" : "none" }}>
          <ReleaseSection />
        </div>
      </div>
    </div>
  );
}

export default App;
