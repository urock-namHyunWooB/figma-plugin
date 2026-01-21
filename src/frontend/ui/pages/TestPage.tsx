import React, { useState, useRef, useCallback, useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { css } from "@emotion/react";
import { useNavigate } from "react-router-dom";
import FigmaCompiler, { PropDefinition } from "@compiler";
import { FigmaNodeData } from "../domain/compiler";
import { renderReactComponent } from "../domain/renderer/component-render";
import { loadFontsFromNodeData } from "../domain/compiler/utils/fontLoader";
import {
  compareNodeStyles,
  StyleDiff,
} from "../domain/compiler/utils/styleComparison";
import { PropController } from "../components/PropController";
// twind - main.tsx에서 export한 전역 인스턴스 사용
import { twindTw } from "../main";

// fixtures/failing 폴더의 JSON 파일들
const failingFixtures = import.meta.glob(
  "../../../../test/fixtures/failing/*.json",
  { eager: true, import: "default" }
) as Record<string, FigmaNodeData>;

// fixtures/failing 폴더의 PNG 파일들
const failingImages = import.meta.glob(
  "../../../../test/fixtures/failing/*.png",
  { eager: true, as: "url" }
) as Record<string, string>;

const fixtureList = Object.entries(failingFixtures).map(([path, data]) => {
  const fileName = path.split("/").pop()?.replace(".json", "") || "";
  const imagePath = path.replace(".json", ".png");
  const imageUrl = failingImages[imagePath];
  return { name: fileName, data, imageUrl };
});

interface VariantResult {
  variantName: string;
  status: "success" | "warning" | "error";
  totalNodes: number;
  foundInDom: number;
  matchedNodes: number;
  styleDiffs: StyleDiff[];
}

interface TestResult {
  name: string;
  status: "success" | "warning" | "error";
  totalNodes: number;
  foundInDom: number;
  matchedNodes: number;
  styleDiffs: StyleDiff[];
  errorMessage?: string;
  isComponentSet?: boolean;
  variants?: VariantResult[];
}

// HTML 네이티브 속성과 충돌하는 prop 이름들 (컴파일러와 동일)
const CONFLICTING_HTML_ATTRS = [
  "disabled",
  "type",
  "value",
  "name",
  "id",
  "hidden",
  "checked",
  "selected",
  "required",
  "readOnly",
  "placeholder",
  "autoFocus",
  "autoComplete",
];

/**
 * 컴파일러와 동일한 renaming 로직
 * name → customName, disabled → customDisabled 등
 */
function renameConflictingPropName(propName: string): string {
  const lowerPropName = propName.toLowerCase();
  if (CONFLICTING_HTML_ATTRS.some((attr) => attr.toLowerCase() === lowerPropName)) {
    return `custom${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
  }
  return propName;
}

/** variant 이름에서 props 파싱
 * 예: "Size=default, Variant=primary, Icon=true"
 * → { size: "default", variant: "primary", icon: true }
 *
 * - key를 camelCase로 변환
 * - HTML 충돌 속성은 custom prefix 추가 (name → customName)
 * - "true"/"false" 값은 boolean으로 변환
 * - State=Disabled → disabled={true} 변환 (컴파일러에서 state prop 삭제됨)
 */
function parseVariantProps(variantName: string): Record<string, any> {
  const props: Record<string, any> = {};
  const pairs = variantName.split(",").map((s) => s.trim());
  for (const pair of pairs) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    if (key && value) {
      // key를 camelCase로 변환 (첫 글자 소문자)
      let camelKey = key.charAt(0).toLowerCase() + key.slice(1);

      // HTML 충돌 속성 rename (컴파일러와 동일한 로직)
      camelKey = renameConflictingPropName(camelKey);

      // "true"/"false"는 boolean으로 변환 (대소문자 무시)
      const lowerValue = value.toLowerCase();
      if (lowerValue === "true") {
        props[camelKey] = true;
      } else if (lowerValue === "false") {
        props[camelKey] = false;
      } else {
        props[camelKey] = value;
      }

      // State=Disabled → disabled 속성 추가
      // (컴파일러에서 :disabled pseudo-class로 변환하므로 button에 disabled 필요)
      if (camelKey === "state" && value === "Disabled") {
        props["disabled"] = true;
      }
    }
  }

  // state prop 제거 (컴파일러에서 삭제했으므로 컴포넌트에서 사용 안함)
  delete props["state"];

  return props;
}

/**
 * SLOT props에 대한 목업 엘리먼트 생성
 * App.tsx와 동일한 로직 - mockupSvg가 있으면 SVG 렌더링, 없으면 점선 박스
 */
function createSlotMockup(prop: PropDefinition): React.ReactNode {
  const slotInfo = prop.slotInfo;

  // mockupSvg가 있으면 SVG 렌더링 (App.tsx와 동일)
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
        boxSizing: "border-box" as const,
      },
    },
    componentName
  );
}

/**
 * Props 정의에서 SLOT 타입의 mockup props 생성
 */
function createSlotMockups(
  propDefinitions: PropDefinition[]
): Record<string, React.ReactNode> {
  const mockups: Record<string, React.ReactNode> = {};
  for (const prop of propDefinitions) {
    if (prop.type === "SLOT") {
      mockups[prop.name] = createSlotMockup(prop);
    }
  }
  return mockups;
}

/** 특정 variant의 nodeData 생성 (해당 variant만 포함) */
function _createVariantNodeData(
  originalNodeData: FigmaNodeData,
  variantNode: any
): FigmaNodeData {
  return {
    ...originalNodeData,
    info: {
      ...originalNodeData.info,
      document: variantNode,
    },
  };
}

/** 비교 결과로 상태 판정 */
function _determineStatus(
  totalNodes: number,
  foundInDom: number,
  matchedNodes: number,
  diffsCount: number
): "success" | "warning" | "error" {
  const foundRate = totalNodes > 0 ? foundInDom / totalNodes : 0;
  const matchRate = foundInDom > 0 ? matchedNodes / foundInDom : 0;

  if (foundInDom === 0 && totalNodes > 0) return "error";
  if (foundRate < 0.3) return "error";
  if (foundRate < 0.5 || matchRate < 0.5) return "warning";
  if (diffsCount > 3) return "warning";
  return "success";
}

type StyleStrategy = "emotion" | "tailwind";

export default function TestPage() {
  const navigate = useNavigate();
  const renderRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Root | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [strategy, setStrategy] = useState<StyleStrategy>("emotion");

  // Props Control 관련 상태 (플러그인 App.tsx와 동일)
  const [propDefinitions, setPropDefinitions] = useState<PropDefinition[]>([]);
  const [propValues, setPropValues] = useState<Record<string, any>>({});
  const [slotMockupEnabled, setSlotMockupEnabled] = useState<Record<string, boolean>>({});
  const [currentComponent, setCurrentComponent] = useState<React.ComponentType<any> | null>(null);

  // 선택된 fixture 렌더링 (Component Set이면 모든 variant 렌더링)
  const renderComponent = useCallback(
    async (fixture: { name: string; data: FigmaNodeData }) => {
      if (!renderRef.current) return;

      const container = renderRef.current;
      try {
        await loadFontsFromNodeData(fixture.data);
        const compiler = new FigmaCompiler(fixture.data, {
          debug: true,
          styleStrategy: { type: strategy },
        });
        const code = await compiler.compile();

        if (!code) {
          container.innerHTML = `<div style="color: red;">컴파일 실패</div>`;
          setPropDefinitions([]);
          setPropValues({});
          setSlotMockupEnabled({});
          setCurrentComponent(null);
          return;
        }

        // 생성된 코드 출력
        console.log(`📝 Generated Code for ${fixture.name} [${strategy}]:\n`, code);

        const Component = await renderReactComponent(code);

        // Props 정의 가져오기 (플러그인과 동일)
        const props = compiler.getPropsDefinition();
        setPropDefinitions(props);
        console.log("📦 All Props:", props.map((p: any) => `${p.name} (${p.type})`));
        console.log("📦 SLOT props with slotInfo:", props.filter((p: any) => p.type === "SLOT").map((p: any) => ({
          name: p.name,
          slotInfo: p.slotInfo
        })));

        // Props 초기값 설정 (SLOT에는 목업 주입) - 플러그인 App.tsx와 동일한 로직
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
        setCurrentComponent(() => Component);

        // 초기 렌더링 - 기존 root 정리 후 새로 생성
        if (rootRef.current) {
          try {
            rootRef.current.unmount();
          } catch (e) {
            // unmount 에러 무시
          }
          rootRef.current = null;
        }
        container.innerHTML = ""; // DOM 완전 정리
        rootRef.current = createRoot(container);

        // 플러그인과 동일하게 단일 컴포넌트만 렌더링 (Props Control 값 사용)
        rootRef.current.render(<Component {...initialValues} />);

        // 테스트 페이지용: 큰 gap 값을 가진 요소의 gap을 조정하여 모든 slot이 보이게 함
        setTimeout(() => {
          container.querySelectorAll('*').forEach((el) => {
            const style = getComputedStyle(el);
            const gapValue = parseInt(style.gap, 10);
            if (gapValue > 100) {
              (el as HTMLElement).style.gap = '16px';
            }
          });
        }, 100);

        // Tailwind 전략일 때 twind로 클래스 처리
        if (strategy === "tailwind") {
          requestAnimationFrame(() => {
            const elements = container.querySelectorAll("[class]");
            elements.forEach((el) => {
              const className = el.getAttribute("class");
              if (className && !className.startsWith("css-")) {
                const classes = className.split(/\s+/).filter(c => c && !c.startsWith("css-"));
                classes.forEach(cls => twindTw(cls));
              }
            });
          });
        }
      } catch (e) {
        container.innerHTML = `<div style="color: red;">렌더링 실패: ${(e as Error).message}</div>`;
      }
    },
    [strategy]
  );

  // Prop 변경 핸들러 (플러그인 App.tsx와 동일)
  const handlePropChange = useCallback((name: string, value: any) => {
    setPropValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  // SLOT 목업 토글 핸들러 (플러그인 App.tsx와 동일)
  const handleSlotMockupToggle = useCallback((name: string, enabled: boolean) => {
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
  }, [propDefinitions]);

  // propValues 변경 시 컴포넌트 다시 렌더링 (플러그인과 동일하게 단일 컴포넌트)
  useEffect(() => {
    if (!currentComponent || !rootRef.current || !renderRef.current) return;

    const timeoutId = setTimeout(() => {
      if (!rootRef.current) return;

      const Component = currentComponent;
      try {
        rootRef.current.render(<Component {...propValues} />);
      } catch (e) {
        console.error("Render error:", e);
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [propValues, currentComponent]);

  // 전체 테스트
  const testAll = useCallback(async () => {
    if (!renderRef.current) return;

    const container = renderRef.current;
    setIsTesting(true);
    setResults([]);
    setProgress({ current: 0, total: fixtureList.length });

    const newResults: TestResult[] = [];

    for (let i = 0; i < fixtureList.length; i++) {
      const fixture = fixtureList[i];
      setProgress({ current: i + 1, total: fixtureList.length });

      try {
        await loadFontsFromNodeData(fixture.data);
        const compiler = new FigmaCompiler(fixture.data, {
          debug: true,
          styleStrategy: { type: strategy },
        });
        const code = await compiler.compile();

        if (!code) {
          newResults.push({
            name: fixture.name,
            status: "error",
            totalNodes: 0,
            foundInDom: 0,
            matchedNodes: 0,
            styleDiffs: [],
            errorMessage: "컴파일 실패",
          });
          continue;
        }

        const Component = await renderReactComponent(code);
        container.innerHTML = "";
        const root = createRoot(container);
        root.render(<Component />);

        await new Promise((r) =>
          requestAnimationFrame(() => setTimeout(r, 150))
        );

        const comparison = compareNodeStyles(fixture.data, container);

        // 신뢰도 기반 상태 판정
        const foundRate =
          comparison.totalNodes > 0
            ? comparison.foundInDom / comparison.totalNodes
            : 0;
        const matchRate =
          comparison.foundInDom > 0
            ? comparison.matchedNodes / comparison.foundInDom
            : 0;

        let status: "success" | "warning" | "error" = "success";

        if (comparison.foundInDom === 0 && comparison.totalNodes > 0) {
          // DOM에서 아무것도 못 찾음 - 구조적 문제
          status = "error";
        } else if (foundRate < 0.1) {
          // 10% 미만만 DOM에서 찾음 - 심각한 불일치
          status = "error";
        } else if (foundRate < 0.5 || matchRate < 0.5) {
          // 50% 미만 발견 또는 50% 미만 매칭
          status = "warning";
        } else if (comparison.diffs.length > 3) {
          // 스타일 차이 3개 초과
          status = "warning";
        }

        newResults.push({
          name: fixture.name,
          status,
          totalNodes: comparison.totalNodes,
          foundInDom: comparison.foundInDom,
          matchedNodes: comparison.matchedNodes,
          styleDiffs: comparison.diffs,
        });

        root.unmount();
      } catch (e) {
        newResults.push({
          name: fixture.name,
          status: "error",
          totalNodes: 0,
          foundInDom: 0,
          matchedNodes: 0,
          styleDiffs: [],
          errorMessage: (e as Error).message,
        });
      }
    }

    setResults(newResults);
    setIsTesting(false);

    // 첫 번째 선택
    if (newResults.length > 0 && fixtureList.length > 0) {
      setSelected(fixtureList[0].name);
      renderComponent(fixtureList[0]);
    }
  }, [renderComponent, strategy]);

  // strategy 변경 시 선택된 컴포넌트 다시 렌더링
  useEffect(() => {
    if (selected) {
      const fixture = fixtureList.find((f) => f.name === selected);
      if (fixture) {
        renderComponent(fixture);
      }
    }
  }, [strategy, selected, renderComponent]);

  // 결과 요약
  const summary = {
    success: results.filter((r) => r.status === "success").length,
    warning: results.filter((r) => r.status === "warning").length,
    error: results.filter((r) => r.status === "error").length,
  };

  const selectedResult = results.find((r) => r.name === selected);
  const selectedFixture = fixtureList.find((f) => f.name === selected);

  return (
    <div css={containerStyle}>
      {/* 헤더 */}
      <header css={headerStyle}>
        <button onClick={() => navigate("/")} css={backBtn}>
          ← Back
        </button>
        <h1 css={titleStyle}>🧪 Component Test</h1>

        {/* Strategy 전환 버튼 */}
        <div css={strategyToggle}>
          <button
            onClick={() => setStrategy("emotion")}
            css={[strategyBtn, strategy === "emotion" && strategyBtnActive]}
          >
            Emotion
          </button>
          <button
            onClick={() => setStrategy("tailwind")}
            css={[strategyBtn, strategy === "tailwind" && strategyBtnActive]}
          >
            Tailwind
          </button>
        </div>

        <button
          onClick={testAll}
          disabled={isTesting || fixtureList.length === 0}
          css={testAllBtn}
        >
          {isTesting
            ? `⏳ ${progress.current}/${progress.total}`
            : `🚀 Test All (${fixtureList.length})`}
        </button>
      </header>

      {/* 결과 요약 */}
      {results.length > 0 && (
        <div css={summaryStyle}>
          <span css={successText}>✅ {summary.success}</span>
          <span css={warningText}>⚠️ {summary.warning}</span>
          <span css={errorText}>❌ {summary.error}</span>
          <span css={totalText}>/ {results.length} 컴포넌트</span>
        </div>
      )}

      {/* 메인 */}
      <div css={mainStyle}>
        {/* 왼쪽: 목록 */}
        <div css={listPanel}>
          {results.length === 0
            ? // 테스트 전: fixture 목록만
              fixtureList.map((f) => (
                <div
                  key={f.name}
                  css={[listItem, selected === f.name && listItemActive]}
                  onClick={() => {
                    setSelected(f.name);
                    renderComponent(f);
                  }}
                >
                  <span css={statusIcon}>⏳</span>
                  <span css={itemName}>{f.name}</span>
                </div>
              ))
            : // 테스트 후: 결과 목록
              results.map((r) => (
                <div
                  key={r.name}
                  css={[
                    listItem,
                    selected === r.name && listItemActive,
                    getStatusBorder(r.status),
                  ]}
                  onClick={() => {
                    setSelected(r.name);
                    const fixture = fixtureList.find((f) => f.name === r.name);
                    if (fixture) renderComponent(fixture);
                  }}
                >
                  <span css={statusIcon}>
                    {r.status === "success" && "✅"}
                    {r.status === "warning" && "⚠️"}
                    {r.status === "error" && "❌"}
                  </span>
                  <span css={itemName}>{r.name}</span>
                  <span
                    css={itemStats}
                    title={`Found: ${r.foundInDom}/${r.totalNodes}, Match: ${r.matchedNodes}`}
                  >
                    {r.foundInDom}/{r.totalNodes}
                  </span>
                </div>
              ))}
        </div>

        {/* 오른쪽: 원본 vs 렌더링 */}
        <div css={detailPanel}>
          {/* 비교 영역 */}
          <div css={compareArea}>
            {/* 원본 이미지 */}
            <div css={compareBox}>
              <div css={compareLabel}>📐 Figma 원본</div>
              <div css={imageContainer}>
                {selectedFixture?.imageUrl ? (
                  <img
                    src={selectedFixture.imageUrl}
                    alt="Figma original"
                    css={originalImage}
                  />
                ) : (
                  <div css={noImage}>이미지 없음</div>
                )}
              </div>
            </div>

            {/* 렌더링 결과 */}
            <div css={compareBox}>
              <div css={compareLabel}>
                🖥️ 렌더링 결과 ({strategy === "emotion" ? "Emotion" : "Tailwind"})
              </div>
              <div ref={renderRef} css={renderBox} />
            </div>
          </div>

          {/* Props Control - 플러그인 App.tsx와 동일한 환경 테스트 */}
          {propDefinitions.length > 0 && (
            <div css={propsControlSection}>
              <PropController
                slotMockupEnabled={slotMockupEnabled}
                onSlotMockupToggle={handleSlotMockupToggle}
                propDefinitions={propDefinitions}
                propValues={propValues}
                onPropChange={handlePropChange}
              />
            </div>
          )}

          {/* 스타일 차이 */}
          {selectedResult && selectedResult.styleDiffs.length > 0 && (
            <div css={diffSection}>
              <h3 css={diffTitle}>
                🎨 스타일 차이 ({selectedResult.styleDiffs.length})
              </h3>
              <div css={diffList}>
                {selectedResult.styleDiffs.slice(0, 20).map((diff, i) => (
                  <div key={i} css={diffItem}>
                    <span css={diffNode}>{diff.nodeName}</span>
                    <span css={diffProp}>{diff.property}</span>
                    <span css={diffExpected}>{diff.expected}</span>
                    <span css={diffArrow}>→</span>
                    <span css={diffActual}>{diff.actual}</span>
                  </div>
                ))}
                {selectedResult.styleDiffs.length > 20 && (
                  <div css={moreText}>
                    ... 외 {selectedResult.styleDiffs.length - 20}개
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedResult?.errorMessage && (
            <div css={errorBox}>{selectedResult.errorMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// 스타일
const containerStyle = css`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d1117;
  color: #e6edf3;
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
`;

const backBtn = css`
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #8b949e;
  cursor: pointer;
  &:hover {
    background: #21262d;
  }
`;

const titleStyle = css`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
`;

const testAllBtn = css`
  padding: 8px 16px;
  background: #238636;
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: #2ea043;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const summaryStyle = css`
  display: flex;
  gap: 20px;
  padding: 10px 20px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  font-size: 14px;
`;

const successText = css`
  color: #3fb950;
`;
const warningText = css`
  color: #d29922;
`;
const errorText = css`
  color: #f85149;
`;
const totalText = css`
  color: #8b949e;
`;

const mainStyle = css`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const listPanel = css`
  width: 280px;
  background: #161b22;
  border-right: 1px solid #30363d;
  overflow-y: auto;
  padding: 8px;
`;

const listItem = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  border-left: 3px solid transparent;
  &:hover {
    background: #21262d;
  }
`;

const listItemActive = css`
  background: #21262d;
`;

const getStatusBorder = (status: string) => {
  switch (status) {
    case "success":
      return css`
        border-left-color: #3fb950;
      `;
    case "warning":
      return css`
        border-left-color: #d29922;
      `;
    case "error":
      return css`
        border-left-color: #f85149;
      `;
    default:
      return css``;
  }
};

const statusIcon = css`
  font-size: 14px;
`;
const itemName = css`
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const itemStats = css`
  font-size: 11px;
  color: #8b949e;
`;

const detailPanel = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const compareArea = css`
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 16px;
  overflow: auto;
  background: #0d1117;
`;

const compareBox = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const compareLabel = css`
  padding: 8px 12px;
  background: #21262d;
  border-radius: 6px 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
`;

const imageContainer = css`
  flex: 1;
  background: white;
  border-radius: 0 0 6px 6px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: auto;
`;

const originalImage = css`
  max-width: 100%;
  height: auto;
`;

const noImage = css`
  color: #8b949e;
  font-size: 13px;
`;

const renderBox = css`
  flex: 1;
  background: white;
  border-radius: 0 0 6px 6px;
  padding: 16px;
  overflow: visible;

  /* 컴파일된 컴포넌트가 잘리지 않도록 overflow: visible 설정 */
  /* 큰 gap으로 인해 요소가 밀려나도 보이게 함 */
`;

const propsControlSection = css`
  padding: 12px 16px;
  background: #161b22;
  border-top: 1px solid #30363d;
`;

const diffSection = css`
  max-height: 200px;
  overflow-y: auto;
  background: #161b22;
  border-top: 1px solid #30363d;
  padding: 12px 16px;
`;

const diffTitle = css`
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #8b949e;
`;

const diffList = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const diffItem = css`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  padding: 4px 8px;
  background: #21262d;
  border-radius: 4px;
`;

const diffNode = css`
  color: #79c0ff;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const diffProp = css`
  color: #d2a8ff;
  min-width: 60px;
`;

const diffExpected = css`
  color: #f85149;
  min-width: 80px;
`;

const diffArrow = css`
  color: #8b949e;
`;

const diffActual = css`
  color: #3fb950;
`;

const moreText = css`
  font-size: 11px;
  color: #8b949e;
  padding: 4px 8px;
`;

const errorBox = css`
  padding: 12px 16px;
  background: rgba(248, 81, 73, 0.1);
  border-top: 1px solid #f85149;
  color: #f85149;
  font-size: 13px;
`;

const strategyToggle = css`
  display: flex;
  background: #21262d;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
`;

const strategyBtn = css`
  padding: 6px 14px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #8b949e;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover {
    color: #e6edf3;
  }
`;

const strategyBtnActive = css`
  background: #30363d;
  color: #e6edf3;
`;
