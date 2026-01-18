import React, { useState, useCallback, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { css } from "@emotion/react";
import { useNavigate } from "react-router-dom";
import * as htmlToImage from "html-to-image";
import JSZip from "jszip";
import FigmaCompiler from "@compiler";
import { ScanItem, ScanState } from "../useMessageHandler";
import { MESSAGE_TYPES } from "../../../backend/types/messages";
import { FigmaNodeData } from "../domain/compiler";
import { renderReactComponent } from "../domain/renderer/component-render";
import {
  extractFigmaLayout,
  extractDomLayout,
  compareLayouts,
  LayoutDiff as LayoutDiffUtil,
} from "../domain/compiler/utils/layoutComparison";
import { loadFontsFromNodeData } from "../domain/compiler/utils/fontLoader";
import { extractDefaultPropsFromNodeData } from "../domain/compiler/utils/extractDefaultProps";
import { compareNodeStyles, getStyleComparisonStatus, StyleDiff } from "../domain/compiler/utils/styleComparison";

/** 비교 결과 타입 */
interface CompareResult {
  id: string;
  name: string;
  nodeType: string;
  status: "pending" | "success" | "warning" | "error";
  layoutDiffs: LayoutDiff[];
  styleDiffs?: StyleDiffItem[];  // 스타일 차이
  errorMessage?: string;
  originalImage?: string;   // Figma 원본 이미지 (base64 data URL)
  renderedImage?: string;   // 렌더링된 이미지 (base64 data URL)
  nodeData?: FigmaNodeData; // Export JSON용
}

interface StyleDiffItem {
  nodeId: string;
  nodeName: string;
  property: string;
  expected: string;
  actual: string;
}

interface LayoutDiff {
  nodeId: string;
  nodeName: string;
  expected: { x: number; y: number; width: number; height: number };
  actual: { x: number; y: number; width: number; height: number } | null;
  diff: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

const initialScanState: ScanState = {
  isScanning: false,
  pageName: "",
  total: 0,
  current: 0,
  succeeded: 0,
  failed: 0,
  items: [],
  errors: [],
};

// 창 크기 상수
const DASHBOARD_SIZE = { width: 900, height: 700 };
const DEFAULT_SIZE = { width: 400, height: 1000 };

export default function ScanDashboardPage() {
  const navigate = useNavigate();
  const [scanState, setScanState] = useState<ScanState>(initialScanState);
  const [compareResults, setCompareResults] = useState<CompareResult[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [compareProgress, setCompareProgress] = useState({ current: 0, total: 0 });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  
  // 선택된 아이템을 최신 데이터에서 조회
  const selectedItem = selectedItemId
    ? (() => {
        const result = compareResults.find((r) => r.id === selectedItemId);
        const item = scanState.items.find((i) => i.id === selectedItemId);
        if (result) return result;
        if (item) {
          const originalImage = item.imageBase64
            ? `data:image/png;base64,${item.imageBase64}`
            : undefined;
          return {
            ...item,
            status: "pending" as const,
            layoutDiffs: [],
            originalImage,
          };
        }
        return null;
      })()
    : null;
  const [includeImages, setIncludeImages] = useState(true); // 이미지 포함 옵션 (기본: ON)
  
  // 스캔 타입 옵션 (기본: COMPONENT_SET만)
  const [scanOptions, setScanOptions] = useState({
    includeFrames: false,
    includeComponentSets: true,  // 기본값!
  });
  const renderContainerRef = useRef<HTMLDivElement>(null);

  // 선택된 아이템의 nodeData 가져오기 (compareResults 또는 scanState.items에서)
  const selectedNodeData = selectedItemId
    ? (compareResults.find((r) => r.id === selectedItemId)?.nodeData ??
       scanState.items.find((i) => i.id === selectedItemId)?.nodeData)
    : null;

  // JSON 내보내기 함수
  const exportNodeDataAsJson = useCallback(() => {
    if (!selectedNodeData || !selectedItem) return;

    const jsonString = JSON.stringify(selectedNodeData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedItem.name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedNodeData, selectedItem]);

  // 전체 Export as ZIP
  const [isExporting, setIsExporting] = useState(false);
  const exportAllAsZip = useCallback(async () => {
    if (scanState.items.length === 0) return;

    setIsExporting(true);
    const zip = new JSZip();

    try {
      for (const item of scanState.items) {
        const safeName = item.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");

        // nodeData JSON 추가
        if (item.nodeData) {
          zip.file(`${safeName}.json`, JSON.stringify(item.nodeData, null, 2));
        }

        // 이미지 추가 (base64)
        if (item.imageBase64) {
          zip.file(`${safeName}.png`, item.imageBase64, { base64: true });
        }

        // COMPONENT_SET인 경우 variants도 추가
        if (item.type === "COMPONENT_SET" && item.variants) {
          for (const variant of item.variants) {
            const variantSafeName = variant.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
            const variantPath = `${safeName}/${variantSafeName}`;

            if (variant.nodeData) {
              zip.file(`${variantPath}.json`, JSON.stringify(variant.nodeData, null, 2));
            }
            if (variant.imageBase64) {
              zip.file(`${variantPath}.png`, variant.imageBase64, { base64: true });
            }
          }
        }
      }

      // ZIP 생성 및 다운로드
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${scanState.pageName || "figma-export"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("ZIP 생성 실패:", e);
    } finally {
      setIsExporting(false);
    }
  }, [scanState.items, scanState.pageName]);

  // Save All to Failing 폴더 (로컬 API 사용)
  const [isSavingToLocal, setIsSavingToLocal] = useState(false);
  const [saveToLocalStatus, setSaveToLocalStatus] = useState("");
  
  // 로컬 개발 서버 URL (항상 절대 경로 사용)
  const devServerUrl = "http://localhost:5173";
  
  const saveAllToFailing = useCallback(async () => {
    if (scanState.items.length === 0) return;

    setIsSavingToLocal(true);
    setSaveToLocalStatus("저장 중... (localhost:5173 연결 시도)");
    
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const item of scanState.items) {
        const safeName = item.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");

        if (item.nodeData) {
          try {
            const response = await fetch(`${devServerUrl}/api/save-failing`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              mode: "cors", // CORS 명시
              body: JSON.stringify({
                fileName: safeName,
                nodeData: item.nodeData,
                imageBase64: item.imageBase64,
              }),
            });

            const result = await response.json();
            if (result.success) {
              successCount++;
            } else {
              errorCount++;
              console.error(`저장 실패: ${safeName}`, result.error);
            }
          } catch (e) {
            errorCount++;
            console.error(`저장 실패: ${safeName}`, e);
          }
        }
      }

      if (errorCount === 0) {
        setSaveToLocalStatus(`✅ ${successCount}개 저장 완료!`);
      } else if (successCount === 0) {
        setSaveToLocalStatus(`❌ 저장 실패 - npm run dev 실행 중인지 확인하세요`);
      } else {
        setSaveToLocalStatus(`⚠️ ${successCount}개 성공, ${errorCount}개 실패`);
      }
    } catch (e) {
      setSaveToLocalStatus(`❌ 오류: ${(e as Error).message}`);
    } finally {
      setIsSavingToLocal(false);
      // 5초 후 상태 초기화
      setTimeout(() => setSaveToLocalStatus(""), 5000);
    }
  }, [scanState.items]);

  // 마운트 시 창 크기 조절
  useEffect(() => {
    parent.postMessage(
      {
        pluginMessage: {
          type: MESSAGE_TYPES.RESIZE_UI,
          width: DASHBOARD_SIZE.width,
          height: DASHBOARD_SIZE.height,
        },
      },
      "*"
    );

    // 언마운트 시 원래 크기로 복원
    return () => {
      parent.postMessage(
        {
          pluginMessage: {
            type: MESSAGE_TYPES.RESIZE_UI,
            width: DEFAULT_SIZE.width,
            height: DEFAULT_SIZE.height,
          },
        },
        "*"
      );
    };
  }, []);

  // 메시지 수신 핸들러
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === MESSAGE_TYPES.SCAN_STARTED) {
        setScanState({
          isScanning: true,
          pageName: msg.pageName || "",
          total: msg.total || 0,
          current: 0,
          succeeded: 0,
          failed: 0,
          items: [],
          errors: [],
        });
        setCompareResults([]);
      }

      if (msg.type === MESSAGE_TYPES.SCAN_ITEM) {
        setScanState((prev) => ({
          ...prev,
          current: msg.current,
          succeeded: prev.succeeded + 1,
          items: [...prev.items, msg.item],
        }));
      }

      if (msg.type === MESSAGE_TYPES.SCAN_ITEM_ERROR) {
        setScanState((prev) => ({
          ...prev,
          failed: prev.failed + 1,
          errors: [
            ...prev.errors,
            { id: msg.id, name: msg.name, error: msg.error },
          ],
        }));
      }

      if (msg.type === MESSAGE_TYPES.SCAN_COMPLETE) {
        setScanState((prev) => ({
          ...prev,
          isScanning: false,
          succeeded: msg.succeeded,
          failed: msg.failed,
        }));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // 스캔 시작
  const startScan = useCallback(() => {
    parent.postMessage(
      {
        pluginMessage: {
          type: MESSAGE_TYPES.SCAN_PAGE,
          options: {
            includeImages,
            ...scanOptions,
          },
        },
      },
      "*"
    );
  }, [includeImages, scanOptions]);

  // UI 업데이트를 위한 yield 함수
  const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

  // 비교 시작
  const startCompare = useCallback(async () => {
    if (scanState.items.length === 0) return;
    if (!renderContainerRef.current) return;

    setIsComparing(true);
    
    // 총 비교 대상 수 계산 (COMPONENT_SET은 variant 개수만큼)
    let totalComparisons = 0;
    for (const item of scanState.items) {
      if (item.nodeType === "COMPONENT_SET" && item.variants?.length) {
        totalComparisons += item.variants.length;
      } else {
        totalComparisons += 1;
      }
    }
    
    setCompareProgress({ current: 0, total: totalComparisons });
    setCompareResults([]); // 이전 결과 초기화

    const results: CompareResult[] = [];
    const container = renderContainerRef.current;
    const TOLERANCE = 2; // 허용 오차 2px
    let currentComparison = 0;

    for (let i = 0; i < scanState.items.length; i++) {
      const item = scanState.items[i];

      try {
        // 0. 폰트 로드 (Figma 데이터에서 사용된 폰트 추출 후 웹폰트 로드)
        await loadFontsFromNodeData(item.nodeData);

        // 1. 컴파일 (debug: true로 data-figma-id 포함)
        const compiler = new FigmaCompiler(item.nodeData, { debug: true });
        const code = await compiler.compile();

        if (!code) {
          throw new Error("컴파일 결과가 없습니다");
        }

        // 2. 코드를 React 컴포넌트로 변환
        const Component = await renderReactComponent(code);

        // COMPONENT_SET: 각 variant별로 개별 컴파일 후 비교
        if (item.nodeType === "COMPONENT_SET" && item.variants?.length) {
          for (const variant of item.variants) {
            currentComparison++;
            setCompareProgress({ current: currentComparison, total: totalComparisons });
            await yieldToUI();

            try {
              // variant nodeData가 없으면 스킵
              if (!variant.nodeData) {
                results.push({
                  id: variant.id,
                  name: `${item.name} / ${variant.name}`,
                  nodeType: "COMPONENT (variant)",
                  status: "error",
                  layoutDiffs: [],
                  errorMessage: "variant nodeData가 없습니다",
                });
                setCompareResults([...results]);
                continue;
              }

              // variant 개별 컴파일 (debug: true로 data-figma-id 포함)
              await loadFontsFromNodeData(variant.nodeData);
              const variantCompiler = new FigmaCompiler(variant.nodeData, { debug: true });
              const variantCode = await variantCompiler.compile();
              
              if (!variantCode) {
                results.push({
                  id: variant.id,
                  name: `${item.name} / ${variant.name}`,
                  nodeType: "COMPONENT (variant)",
                  status: "error",
                  layoutDiffs: [],
                  errorMessage: "컴파일 실패",
                  nodeData: variant.nodeData,
                });
                setCompareResults([...results]);
                continue;
              }

              const VariantComponent = await renderReactComponent(variantCode);
              
              container.innerHTML = "";
              const root = createRoot(container);
              root.render(<VariantComponent />);

              // 렌더링 완료 대기
              await new Promise((resolve) => {
                requestAnimationFrame(() => setTimeout(resolve, 50));
              });

              // 렌더링 성공 여부 확인
              const preCheckRect = container.getBoundingClientRect();
              if (preCheckRect.width === 0 || preCheckRect.height === 0) {
                const originalImage = variant.imageBase64
                  ? `data:image/png;base64,${variant.imageBase64}`
                  : undefined;

                results.push({
                  id: variant.id,
                  name: `${item.name} / ${variant.name}`,
                  nodeType: "COMPONENT (variant)",
                  status: "error",
                  layoutDiffs: [],
                  errorMessage: "렌더링 실패: 0x0 크기",
                  originalImage,
                  nodeData: variant.nodeData,
                });
                root.unmount();
                setCompareResults([...results]);
                continue;
              }

              // 렌더링된 이미지 캡처
              let renderedImage: string | undefined;
              try {
                container.style.visibility = "visible";
                container.style.position = "fixed";
                container.style.left = "0";
                container.style.top = "0";
                container.style.zIndex = "-1";
                
                renderedImage = await htmlToImage.toPng(container, {
                  backgroundColor: "#ffffff",
                });
                
                container.style.visibility = "hidden";
                container.style.position = "absolute";
                container.style.left = "-9999px";
              } catch {
                container.style.visibility = "hidden";
                container.style.position = "absolute";
                container.style.left = "-9999px";
              }

              const originalImage = variant.imageBase64
                ? `data:image/png;base64,${variant.imageBase64}`
                : undefined;

              // 스타일 비교 (픽셀 비교 대신)
              let variantStatus: "success" | "warning" | "error" = "success";
              let styleDiffs: StyleDiffItem[] = [];
              
              if (variant.nodeData) {
                const styleComparison = compareNodeStyles(variant.nodeData, container);
                variantStatus = getStyleComparisonStatus(styleComparison);
                styleDiffs = styleComparison.diffs.map(d => ({
                  nodeId: d.nodeId,
                  nodeName: d.nodeName,
                  property: d.property,
                  expected: d.expected,
                  actual: d.actual,
                }));
                
                console.log(`🎨 [StyleCompare] ${variant.name}: ${styleComparison.matchedNodes}/${styleComparison.totalNodes} matched, ${styleDiffs.length} diffs`);
              }

              // variant 비교 결과 (스타일 비교)
              results.push({
                id: variant.id,
                name: `${item.name} / ${variant.name}`,
                nodeType: "COMPONENT (variant)",
                status: variantStatus,
                layoutDiffs: [],
                styleDiffs,
                originalImage,
                renderedImage,
                nodeData: variant.nodeData,
              });

              root.unmount();
            } catch (variantError) {
              results.push({
                id: variant.id,
                name: `${item.name} / ${variant.name}`,
                nodeType: "COMPONENT (variant)",
                status: "error",
                layoutDiffs: [],
                errorMessage: variantError instanceof Error ? variantError.message : String(variantError),
                originalImage: variant.imageBase64 ? `data:image/png;base64,${variant.imageBase64}` : undefined,
                nodeData: variant.nodeData,
              });
            }

            setCompareResults([...results]);
          }
          continue;  // 다음 item으로
        }

        // FRAME 등 일반 노드: 기존 로직
        currentComparison++;
        setCompareProgress({ current: currentComparison, total: totalComparisons });
        await yieldToUI();

        // ArraySlot props 추출 (실제 인스턴스 데이터 기반)
        const defaultProps = extractDefaultPropsFromNodeData(item.nodeData);

        // 숨겨진 DOM 컨테이너에 렌더링 (props 전달!)
        container.innerHTML = "";
        const root = createRoot(container);
        root.render(<Component {...defaultProps} />);

        // 4. 렌더링 완료 대기
        await new Promise((resolve) => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 50);
          });
        });

        // 4.5. 렌더링 성공 여부 확인 (0x0이면 렌더링 실패)
        const preCheckRect = container.getBoundingClientRect();
        if (preCheckRect.width === 0 || preCheckRect.height === 0) {
          // 렌더링 실패 - 런타임 에러 발생 가능성
          const originalImage = item.imageBase64
            ? `data:image/png;base64,${item.imageBase64}`
            : undefined;

          results.push({
            id: item.id,
            name: item.name,
            nodeType: item.nodeType,
            status: "error",
            layoutDiffs: [],
            errorMessage: "렌더링 실패: 컴포넌트가 올바르게 렌더링되지 않았습니다 (런타임 에러 가능성). 콘솔에서 상세 에러를 확인하세요.",
            originalImage,
            nodeData: item.nodeData,
          });

          root.unmount();
          setCompareResults([...results]);
          continue;
        }

        // 5. Figma 레이아웃 추출
        const figmaLayouts = extractFigmaLayout(item.nodeData);

        // 6. DOM 레이아웃 추출
        const domLayouts = extractDomLayout(container);

        // 7. 레이아웃 비교
        const comparison = compareLayouts(figmaLayouts, domLayouts, {
          tolerance: TOLERANCE,
        });

        // 8. 결과 변환
        const layoutDiffs: LayoutDiff[] = comparison.diffs
          .filter((d) => !d.isMatch)
          .map((d) => ({
            nodeId: d.id,
            nodeName: d.name,
            expected: {
              x: d.expected.x,
              y: d.expected.y,
              width: d.expected.width,
              height: d.expected.height,
            },
            actual: {
              x: d.actual.x,
              y: d.actual.y,
              width: d.actual.width,
              height: d.actual.height,
            },
            diff: {
              x: d.xDiff,
              y: d.yDiff,
              width: d.widthDiff,
              height: d.heightDiff,
            },
          }));

        // 9. 렌더링된 컴포넌트 캡처
        let renderedImage: string | undefined;
        try {
          // 캡처 전에 컨테이너를 잠시 보이게 함
          container.style.visibility = "visible";
          container.style.position = "fixed";
          container.style.left = "0";
          container.style.top = "0";
          container.style.zIndex = "-1";
          container.style.width = "auto";
          container.style.height = "auto";
          
          // 컨테이너 사이즈 확인
          const rect = container.getBoundingClientRect();
          
          if (rect.width > 0 && rect.height > 0) {
            renderedImage = await htmlToImage.toPng(container, {
              backgroundColor: "#ffffff",
              width: rect.width,
              height: rect.height,
            });
          }
          
          // 다시 숨김
          container.style.visibility = "hidden";
          container.style.position = "absolute";
          container.style.left = "-9999px";
        } catch {
          // 이미지 캡처 실패 시 무시 (렌더링 이미지 없이 진행)
          container.style.visibility = "hidden";
          container.style.position = "absolute";
          container.style.left = "-9999px";
        }

        // 10. 원본 이미지 (base64 → data URL)
        const originalImage = item.imageBase64
          ? `data:image/png;base64,${item.imageBase64}`
          : undefined;

        // 11. 상태 결정
        let status: CompareResult["status"] = "success";
        if (layoutDiffs.length > 0) {
          const hasLargeDiff = layoutDiffs.some(
            (d) =>
              d.diff &&
              (d.diff.x > 10 || d.diff.y > 10 || d.diff.width > 10 || d.diff.height > 10)
          );
          status = hasLargeDiff ? "error" : "warning";
        }

        results.push({
          id: item.id,
          name: item.name,
          nodeType: item.nodeType,
          status,
          layoutDiffs,
          originalImage,
          renderedImage,
          nodeData: item.nodeData,
        });

        // 12. 정리
        root.unmount();
      } catch (error) {
        // 에러가 발생해도 원본 이미지는 저장
        const originalImage = item.imageBase64
          ? `data:image/png;base64,${item.imageBase64}`
          : undefined;

        results.push({
          id: item.id,
          name: item.name,
          nodeType: item.nodeType,
          status: "error",
          layoutDiffs: [],
          errorMessage:
            error instanceof Error ? error.message : String(error),
          originalImage,
          nodeData: item.nodeData,
        });
      }

      // 중간 결과 업데이트 (실시간 피드백)
      setCompareResults([...results]);
    }

    setIsComparing(false);
  }, [scanState.items]);

  const successCount = compareResults.filter(
    (r) => r.status === "success"
  ).length;
  const warningCount = compareResults.filter(
    (r) => r.status === "warning"
  ).length;
  const errorCount = compareResults.filter((r) => r.status === "error").length;

  return (
    <div css={containerStyle}>
      {/* 헤더 */}
      <header css={headerStyle}>
        <div css={headerLeftStyle}>
          <button onClick={() => navigate("/")} css={backButtonStyle}>
            ← Back
          </button>
          <h1>🔍 Scan Dashboard</h1>
        </div>
        <div css={headerActionsStyle}>
          {/* 스캔 타입 옵션 */}
          <label css={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={scanOptions.includeComponentSets}
              onChange={(e) =>
                setScanOptions((prev) => ({
                  ...prev,
                  includeComponentSets: e.target.checked,
                }))
              }
              disabled={scanState.isScanning}
            />
            🧩 Component Sets
          </label>
          <label css={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={scanOptions.includeFrames}
              onChange={(e) =>
                setScanOptions((prev) => ({
                  ...prev,
                  includeFrames: e.target.checked,
                }))
              }
              disabled={scanState.isScanning}
            />
            📐 Frames
          </label>
          <span css={separatorStyle}>|</span>
          <label css={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={includeImages}
              onChange={(e) => setIncludeImages(e.target.checked)}
              disabled={scanState.isScanning}
            />
            📷 Images
          </label>
          <button
            onClick={startScan}
            disabled={scanState.isScanning}
            css={buttonStyle}
          >
            {scanState.isScanning
              ? `스캔 중... ${scanState.current}/${scanState.total}`
              : "📄 Scan Page"}
          </button>
          <button
            onClick={startCompare}
            disabled={
              isComparing || scanState.isScanning || scanState.items.length === 0
            }
            css={[buttonStyle, compareButtonStyle]}
          >
            {isComparing
              ? `비교 중... ${compareProgress.current}/${compareProgress.total}`
              : "🔬 Compare All"}
          </button>
          <button
            onClick={exportAllAsZip}
            disabled={
              isExporting || scanState.isScanning || scanState.items.length === 0
            }
            css={[buttonStyle, exportZipButtonStyle]}
          >
            {isExporting ? "📦 Exporting..." : "📦 Export ZIP"}
          </button>
          <button
            onClick={saveAllToFailing}
            disabled={
              isSavingToLocal || scanState.isScanning || scanState.items.length === 0
            }
            css={[buttonStyle, saveToLocalButtonStyle]}
          >
            {isSavingToLocal ? "💾 Saving..." : "💾 Save to Local"}
          </button>
        </div>
      </header>

      {/* Save to Local 상태 메시지 */}
      {saveToLocalStatus && (
        <div css={saveStatusBannerStyle}>{saveToLocalStatus}</div>
      )}

      {/* 요약 */}
      {scanState.total > 0 && (
        <div css={summaryStyle}>
          <div css={summaryItemStyle}>
            <span css={labelStyle}>Page:</span>
            <span>{scanState.pageName}</span>
          </div>
          <div css={summaryItemStyle}>
            <span css={labelStyle}>Scanned:</span>
            <span>
              {scanState.succeeded} / {scanState.total}
            </span>
          </div>
          {compareResults.length > 0 && (
            <>
              <div css={[summaryItemStyle, successStyle]}>
                ✅ {successCount}
              </div>
              <div css={[summaryItemStyle, warningStyle]}>
                ⚠️ {warningCount}
              </div>
              <div css={[summaryItemStyle, errorStyle]}>❌ {errorCount}</div>
            </>
          )}
        </div>
      )}

      {/* 메인 컨텐츠 */}
      <div css={mainContentStyle}>
        {/* 결과 목록 */}
        <div css={listPanelStyle}>
          <h2 css={panelTitleStyle}>
            {compareResults.length > 0 
              ? `Results (${compareResults.length})`
              : `Components (${scanState.items.length})`
            }
          </h2>
          <div css={listStyle}>
            {/* Compare 결과가 있으면 결과 표시, 없으면 스캔 아이템 표시 */}
            {compareResults.length > 0 ? (
              compareResults.map((result) => (
                <div
                  key={result.id}
                  css={[
                    listItemStyle,
                    selectedItemId === result.id && selectedItemStyle,
                  ]}
                  onClick={() => setSelectedItemId(result.id)}
                >
                  <span css={statusIconStyle}>
                    {result.status === "success" && "✅"}
                    {result.status === "warning" && "⚠️"}
                    {result.status === "error" && "❌"}
                  </span>
                  <span css={itemNameStyle}>{result.name}</span>
                  <span css={nodeTypeStyle}>{result.nodeType}</span>
                </div>
              ))
            ) : (
              scanState.items.map((item) => (
                <div
                  key={item.id}
                  css={[
                    listItemStyle,
                    selectedItemId === item.id && selectedItemStyle,
                  ]}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <span css={statusIconStyle}>⏳</span>
                  <span css={itemNameStyle}>{item.name}</span>
                  <span css={nodeTypeStyle}>{item.nodeType}</span>
                </div>
              ))
            )}
            {scanState.errors.map((err) => (
              <div key={err.id} css={[listItemStyle, errorItemStyle]}>
                <span css={statusIconStyle}>❌</span>
                <span css={itemNameStyle}>{err.name}</span>
                <span css={errorTextStyle}>{err.error}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 상세 정보 */}
        <div css={detailPanelStyle}>
          {selectedItem ? (
            <>
              <h2 css={panelTitleStyle}>
                {selectedItem.status === "success" && "✅ "}
                {selectedItem.status === "warning" && "⚠️ "}
                {selectedItem.status === "error" && "❌ "}
                {selectedItem.name}
              </h2>
              <div css={detailContentStyle}>
                <div css={infoGridStyle}>
                  <span css={infoLabelStyle}>ID</span>
                  <span css={infoValueStyle}>{selectedItem.id}</span>
                  <span css={infoLabelStyle}>Type</span>
                  <span css={infoValueStyle}>{selectedItem.nodeType}</span>
                  <span css={infoLabelStyle}>Status</span>
                  <span css={[infoValueStyle, getStatusColor(selectedItem.status)]}>
                    {selectedItem.status.toUpperCase()}
                  </span>
                  {selectedItem.imageDiffPercentage !== undefined && (
                    <>
                      <span css={infoLabelStyle}>Image Diff</span>
                      <span css={[infoValueStyle, getStatusColor(
                        selectedItem.imageDiffPercentage > 20 ? "error" :
                        selectedItem.imageDiffPercentage > 5 ? "warning" : "success"
                      )]}>
                        {selectedItem.imageDiffPercentage.toFixed(1)}%
                      </span>
                    </>
                  )}
                </div>

                {/* Export JSON 버튼 */}
                <div css={actionButtonsStyle}>
                  <button
                    onClick={exportNodeDataAsJson}
                    disabled={!selectedNodeData}
                    css={exportButtonStyle}
                  >
                    📥 Export JSON
                  </button>
                </div>

                {selectedItem.errorMessage && (
                  <div css={errorMessageStyle}>
                    <strong>🚨 Error:</strong> {selectedItem.errorMessage}
                  </div>
                )}

                {selectedItem.layoutDiffs.length > 0 && (
                  <div css={diffSectionStyle}>
                    <h3 css={diffTitleStyle}>
                      📐 Layout Differences ({selectedItem.layoutDiffs.length})
                    </h3>
                    <table css={diffTableStyle}>
                      <thead>
                        <tr>
                          <th>Element</th>
                          <th>Property</th>
                          <th>Expected</th>
                          <th>Actual</th>
                          <th>Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItem.layoutDiffs.map((diff, i) => (
                          <React.Fragment key={i}>
                            {diff.diff && diff.diff.x > 2 && (
                              <tr css={getDiffRowStyle(diff.diff.x)}>
                                <td rowSpan={1}>{diff.nodeName || diff.nodeId}</td>
                                <td>X</td>
                                <td>{diff.expected.x.toFixed(1)}</td>
                                <td>{diff.actual?.x.toFixed(1)}</td>
                                <td css={diffValueStyle}>{diff.diff.x.toFixed(1)}px</td>
                              </tr>
                            )}
                            {diff.diff && diff.diff.y > 2 && (
                              <tr css={getDiffRowStyle(diff.diff.y)}>
                                <td>{diff.nodeName || diff.nodeId}</td>
                                <td>Y</td>
                                <td>{diff.expected.y.toFixed(1)}</td>
                                <td>{diff.actual?.y.toFixed(1)}</td>
                                <td css={diffValueStyle}>{diff.diff.y.toFixed(1)}px</td>
                              </tr>
                            )}
                            {diff.diff && diff.diff.width > 2 && (
                              <tr css={getDiffRowStyle(diff.diff.width)}>
                                <td>{diff.nodeName || diff.nodeId}</td>
                                <td>Width</td>
                                <td>{diff.expected.width.toFixed(1)}</td>
                                <td>{diff.actual?.width.toFixed(1)}</td>
                                <td css={diffValueStyle}>{diff.diff.width.toFixed(1)}px</td>
                              </tr>
                            )}
                            {diff.diff && diff.diff.height > 2 && (
                              <tr css={getDiffRowStyle(diff.diff.height)}>
                                <td>{diff.nodeName || diff.nodeId}</td>
                                <td>Height</td>
                                <td>{diff.expected.height.toFixed(1)}</td>
                                <td>{diff.actual?.height.toFixed(1)}</td>
                                <td css={diffValueStyle}>{diff.diff.height.toFixed(1)}px</td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 스타일 차이 표시 */}
                {selectedItem.styleDiffs && selectedItem.styleDiffs.length > 0 && (
                  <div css={diffSectionStyle}>
                    <h3 css={diffTitleStyle}>
                      🎨 Style Differences ({selectedItem.styleDiffs.length})
                    </h3>
                    <table css={diffTableStyle}>
                      <thead>
                        <tr>
                          <th>Element</th>
                          <th>Property</th>
                          <th>Expected</th>
                          <th>Actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItem.styleDiffs.map((diff, i) => (
                          <tr key={i} css={css`background-color: rgba(234, 179, 8, 0.1);`}>
                            <td>{diff.nodeName}</td>
                            <td>{diff.property}</td>
                            <td>
                              {diff.property.includes("olor") && (
                                <span 
                                  css={css`
                                    display: inline-block;
                                    width: 14px;
                                    height: 14px;
                                    border-radius: 2px;
                                    margin-right: 6px;
                                    vertical-align: middle;
                                    background-color: ${diff.expected};
                                    border: 1px solid rgba(255,255,255,0.2);
                                  `}
                                />
                              )}
                              {diff.expected}
                            </td>
                            <td>
                              {diff.property.includes("olor") && (
                                <span 
                                  css={css`
                                    display: inline-block;
                                    width: 14px;
                                    height: 14px;
                                    border-radius: 2px;
                                    margin-right: 6px;
                                    vertical-align: middle;
                                    background-color: ${diff.actual};
                                    border: 1px solid rgba(255,255,255,0.2);
                                  `}
                                />
                              )}
                              {diff.actual}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedItem.status === "success" && 
                  selectedItem.layoutDiffs.length === 0 && 
                  (!selectedItem.styleDiffs || selectedItem.styleDiffs.length === 0) && (
                  <div css={successMessageStyle}>
                    ✨ 모든 레이아웃과 스타일이 정확히 일치합니다!
                  </div>
                )}

                {/* Side-by-side 이미지 비교 */}
                {(selectedItem.originalImage || selectedItem.renderedImage) && (
                  <div css={imageCompareSection}>
                    <h3 css={diffTitleStyle}>🖼️ Visual Comparison</h3>
                    <div css={imageCompareContainer}>
                      <div css={imageBox}>
                        <div css={imageLabel}>Original (Figma)</div>
                        {selectedItem.originalImage ? (
                          <img
                            src={selectedItem.originalImage}
                            alt="Figma Original"
                            css={compareImage}
                          />
                        ) : (
                          <div css={noImagePlaceholder}>No image</div>
                        )}
                      </div>
                      <div css={imageBox}>
                        <div css={imageLabel}>Rendered (React)</div>
                        {selectedItem.renderedImage ? (
                          <img
                            src={selectedItem.renderedImage}
                            alt="Rendered"
                            css={compareImage}
                          />
                        ) : (
                          <div css={noImagePlaceholder}>No image</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div css={emptyDetailStyle}>
              👈 Select a component to view details
            </div>
          )}
        </div>
      </div>

      {/* 숨겨진 렌더 컨테이너 */}
      <div
        ref={renderContainerRef}
        css={hiddenRenderContainerStyle}
      />
    </div>
  );
}

// Styles
const containerStyle = css`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d1117;
  color: #c9d1d9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const headerStyle = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #161b22;
  border-bottom: 1px solid #30363d;

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
`;

const headerLeftStyle = css`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const backButtonStyle = css`
  padding: 6px 12px;
  background: transparent;
  color: #8b949e;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #21262d;
    color: #c9d1d9;
  }
`;

const headerActionsStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const checkboxLabelStyle = css`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8b949e;
  cursor: pointer;

  input {
    cursor: pointer;
  }

  &:hover {
    color: #c9d1d9;
  }
`;

const separatorStyle = css`
  color: #484f58;
  font-size: 14px;
  margin: 0 4px;
`;

const buttonStyle = css`
  padding: 8px 16px;
  background: #238636;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;

  &:hover:not(:disabled) {
    background: #2ea043;
  }

  &:disabled {
    background: #484f58;
    cursor: not-allowed;
  }
`;

const compareButtonStyle = css`
  background: #1f6feb;

  &:hover:not(:disabled) {
    background: #388bfd;
  }
`;

const exportZipButtonStyle = css`
  background: #238636;

  &:hover:not(:disabled) {
    background: #2ea043;
  }
`;

const saveToLocalButtonStyle = css`
  background: #9333ea;

  &:hover:not(:disabled) {
    background: #a855f7;
  }
`;

const saveStatusBannerStyle = css`
  padding: 8px 16px;
  background: rgba(147, 51, 234, 0.2);
  border-bottom: 1px solid rgba(147, 51, 234, 0.3);
  text-align: center;
  font-size: 13px;
  color: #e0e0e0;
`;

const summaryStyle = css`
  display: flex;
  gap: 24px;
  padding: 12px 24px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
`;

const summaryItemStyle = css`
  display: flex;
  gap: 8px;
  font-size: 14px;
`;

const labelStyle = css`
  color: #8b949e;
`;

const successStyle = css`
  color: #3fb950;
`;

const warningStyle = css`
  color: #d29922;
`;

const errorStyle = css`
  color: #f85149;
`;

const mainContentStyle = css`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const listPanelStyle = css`
  width: 320px;
  border-right: 1px solid #30363d;
  display: flex;
  flex-direction: column;
`;

const panelTitleStyle = css`
  margin: 0;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  background: #21262d;
  border-bottom: 1px solid #30363d;
`;

const listStyle = css`
  flex: 1;
  overflow-y: auto;
`;

const listItemStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid #21262d;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: #21262d;
  }
`;

const selectedItemStyle = css`
  background: #1f6feb33;

  &:hover {
    background: #1f6feb44;
  }
`;

const errorItemStyle = css`
  background: #f8514922;
`;

const statusIconStyle = css`
  font-size: 14px;
  flex-shrink: 0;
`;

const itemNameStyle = css`
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const nodeTypeStyle = css`
  font-size: 11px;
  color: #8b949e;
  background: #30363d;
  padding: 2px 6px;
  border-radius: 4px;
`;

const errorTextStyle = css`
  font-size: 11px;
  color: #f85149;
`;

const detailPanelStyle = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const detailContentStyle = css`
  flex: 1;
  padding: 16px;
  overflow-y: auto;

  p {
    margin: 8px 0;
    font-size: 13px;
  }
`;

const emptyDetailStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b949e;
  font-size: 14px;
`;

const errorMessageStyle = css`
  color: #f85149;
  background: #f8514922;
  padding: 8px 12px;
  border-radius: 6px;
`;

const diffItemStyle = css`
  margin: 8px 0;
  padding: 8px;
  background: #21262d;
  border-radius: 6px;

  pre {
    margin: 8px 0 0;
    font-size: 11px;
    overflow-x: auto;
  }
`;

const infoGridStyle = css`
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px 12px;
  margin-bottom: 16px;
  padding: 12px;
  background: #21262d;
  border-radius: 8px;
`;

const infoLabelStyle = css`
  color: #8b949e;
  font-size: 12px;
  font-weight: 500;
`;

const infoValueStyle = css`
  font-size: 12px;
  color: #c9d1d9;
  word-break: break-all;
`;

const actionButtonsStyle = css`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const exportButtonStyle = css`
  padding: 8px 16px;
  background: #30363d;
  color: #c9d1d9;
  border: 1px solid #484f58;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: #484f58;
    border-color: #6e7681;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const getStatusColor = (status: string) => {
  switch (status) {
    case "success":
      return css`color: #3fb950; font-weight: 600;`;
    case "warning":
      return css`color: #d29922; font-weight: 600;`;
    case "error":
      return css`color: #f85149; font-weight: 600;`;
    default:
      return css``;
  }
};

const diffSectionStyle = css`
  margin-top: 16px;
`;

const diffTitleStyle = css`
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #c9d1d9;
`;

const diffTableStyle = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th, td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid #30363d;
  }

  th {
    background: #21262d;
    color: #8b949e;
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
  }

  td {
    color: #c9d1d9;
  }

  td:first-of-type {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const getDiffRowStyle = (diffValue: number) => {
  if (diffValue > 10) {
    return css`
      background: rgba(248, 81, 73, 0.15);
      td { color: #f85149; }
    `;
  }
  if (diffValue > 5) {
    return css`
      background: rgba(210, 153, 34, 0.15);
      td { color: #d29922; }
    `;
  }
  return css`
    background: rgba(210, 153, 34, 0.08);
  `;
};

const diffValueStyle = css`
  font-weight: 600;
  font-family: monospace;
`;

const successMessageStyle = css`
  margin-top: 16px;
  padding: 16px;
  background: rgba(63, 185, 80, 0.1);
  border: 1px solid rgba(63, 185, 80, 0.3);
  border-radius: 8px;
  color: #3fb950;
  text-align: center;
  font-size: 14px;
`;

const imageCompareSection = css`
  margin-top: 20px;
  border-top: 1px solid #30363d;
  padding-top: 16px;
`;

const imageCompareContainer = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 12px;
`;

const imageBox = css`
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  overflow: hidden;
`;

const imageLabel = css`
  padding: 8px 12px;
  background: #21262d;
  color: #8b949e;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  border-bottom: 1px solid #30363d;
`;

const compareImage = css`
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  background: #0d1117;
`;

const noImagePlaceholder = css`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: #484f58;
  font-size: 13px;
`;

const hiddenRenderContainerStyle = css`
  position: absolute;
  left: -9999px;
  top: -9999px;
  visibility: hidden;
`;
