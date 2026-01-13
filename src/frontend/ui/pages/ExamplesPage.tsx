/// <reference types="vite/client" />
import React, { useState, Suspense, useMemo, ComponentType } from "react";
import { css } from "@emotion/react";

// Vite의 import.meta.glob으로 examples 폴더의 모든 .tsx 파일을 동적으로 가져옴
const exampleModules = import.meta.glob("../examples/*.tsx") as Record<
  string,
  () => Promise<{ default: ComponentType<any> }>
>;

// 파일 경로에서 이름 추출하는 함수
function getNameFromPath(path: string): string {
  const fileName = path.split("/").pop() || "";
  return fileName.replace(".tsx", "");
}

// 정렬된 examples 배열 생성
const examples = Object.entries(exampleModules)
  .map(([path, importFn]) => ({
    name: getNameFromPath(path),
    importFn,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Styles
const containerStyle = css`
  display: flex;
  height: 100vh;
  background: #121212;
  color: #e0e0e0;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const sidebarStyle = css`
  width: 240px;
  background: #1a1a1a;
  border-right: 1px solid #2d2d2d;
  display: flex;
  flex-direction: column;
`;

const sidebarHeaderStyle = css`
  padding: 16px;
  font-size: 14px;
  font-weight: 600;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #2d2d2d;
`;

const fileListStyle = css`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
`;

const fileItemStyle = css`
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #b0b0b0;
  transition: all 0.15s ease;

  &:hover {
    background: #2d2d2d;
    color: #e0e0e0;
  }
`;

const fileItemActiveStyle = css`
  background: #0078d4;
  color: #fff;

  &:hover {
    background: #0078d4;
    color: #fff;
  }
`;

const mainContentStyle = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const headerStyle = css`
  padding: 16px 24px;
  border-bottom: 1px solid #2d2d2d;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const titleStyle = css`
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
`;

const backLinkStyle = css`
  font-size: 13px;
  color: #0078d4;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const previewAreaStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow: auto;
`;

const previewBoxStyle = css`
  background: white;
  border-radius: 12px;
  padding: 48px;
  min-width: 300px;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
`;

const emptyStateStyle = css`
  color: #606060;
  font-size: 14px;
  text-align: center;
`;

const loadingStyle = css`
  color: #808080;
  font-size: 14px;
`;

export function ExamplesPage() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 선택된 컴포넌트를 lazy로 생성
  const SelectedComponent = useMemo(() => {
    if (selectedIndex === null) return null;
    const { importFn } = examples[selectedIndex];
    return React.lazy(importFn);
  }, [selectedIndex]);

  return (
    <div css={containerStyle}>
      {/* Sidebar */}
      <aside css={sidebarStyle}>
        <div css={sidebarHeaderStyle}>Examples</div>
        <div css={fileListStyle}>
          {examples.map((example, index) => (
            <div
              key={example.name}
              css={[
                fileItemStyle,
                selectedIndex === index && fileItemActiveStyle,
              ]}
              onClick={() => setSelectedIndex(index)}
            >
              {example.name}.tsx
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main css={mainContentStyle}>
        <header css={headerStyle}>
          <span css={titleStyle}>
            {selectedIndex !== null
              ? examples[selectedIndex].name
              : "Select a component"}
          </span>
          <a href="/" css={backLinkStyle}>
            ← Back to App
          </a>
        </header>

        <div css={previewAreaStyle}>
          <div css={previewBoxStyle}>
            {SelectedComponent ? (
              <Suspense fallback={<span css={loadingStyle}>Loading...</span>}>
                <SelectedComponent />
              </Suspense>
            ) : (
              <span css={emptyStateStyle}>
                Select a component from the sidebar to preview
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default ExamplesPage;
