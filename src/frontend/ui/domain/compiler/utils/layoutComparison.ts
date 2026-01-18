import type { FigmaNodeData } from "@compiler/types/baseType";

/**
 * 레이아웃 데이터 타입
 */
export interface LayoutData {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 레이아웃 비교 결과 타입
 */
export interface LayoutDiff {
  id: string;
  name: string;
  xDiff: number;
  yDiff: number;
  widthDiff: number;
  heightDiff: number;
  isMatch: boolean;
  expected: LayoutData;
  actual: LayoutData;
}

/**
 * 전체 비교 결과 타입
 */
export interface LayoutComparisonResult {
  totalNodes: number;
  matchedNodes: number;
  mismatchedNodes: number;
  missingInDom: string[];  // Figma에는 있지만 DOM에 없는 노드
  diffs: LayoutDiff[];
}

export interface CompareOptions {
  tolerance?: number;  // 허용 오차 (px), 기본값: 0
}

/**
 * Figma 노드 데이터에서 레이아웃 정보 추출
 * absoluteBoundingBox를 루트 기준 상대 좌표로 변환
 */
export function extractFigmaLayout(nodeData: FigmaNodeData): LayoutData[] {
  const layouts: LayoutData[] = [];
  const document = (nodeData.info as any).document;
  
  // 루트 노드의 absoluteBoundingBox를 기준점으로 사용
  const rootBox = document.absoluteBoundingBox;
  if (!rootBox) return layouts;
  
  const rootX = rootBox.x;
  const rootY = rootBox.y;
  
  function traverse(node: any) {
    if (!node) return;
    
    const box = node.absoluteBoundingBox;
    if (box) {
      layouts.push({
        id: node.id,
        name: node.name || "",
        // 루트 기준 상대 좌표
        x: box.x - rootX,
        y: box.y - rootY,
        width: box.width,
        height: box.height,
      });
    }
    
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  
  traverse(document);
  return layouts;
}

/**
 * DOM 컨테이너에서 data-figma-id를 가진 요소들의 레이아웃 추출
 * 루트 요소 기준 상대 좌표로 변환
 */
export function extractDomLayout(container: HTMLElement): LayoutData[] {
  const layouts: LayoutData[] = [];
  
  // data-figma-id를 가진 모든 요소 찾기
  const elements = container.querySelectorAll("[data-figma-id]");
  if (elements.length === 0) return layouts;
  
  // 첫 번째 요소(루트)의 위치를 기준점으로 사용
  const firstElement = elements[0] as HTMLElement;
  const rootRect = firstElement.getBoundingClientRect();
  const rootX = rootRect.left;
  const rootY = rootRect.top;
  
  elements.forEach((element) => {
    const el = element as HTMLElement;
    const id = el.getAttribute("data-figma-id");
    if (!id) return;
    
    const rect = el.getBoundingClientRect();
    
    layouts.push({
      id,
      name: "", // DOM에서는 이름을 알 수 없음
      x: rect.left - rootX,
      y: rect.top - rootY,
      width: rect.width,
      height: rect.height,
    });
  });
  
  return layouts;
}

/**
 * 두 개별 레이아웃 비교
 */
export function compareLayout(
  expected: LayoutData,
  actual: LayoutData,
  options?: CompareOptions
): LayoutDiff {
  const tolerance = options?.tolerance ?? 0;
  
  const xDiff = Math.abs(expected.x - actual.x);
  const yDiff = Math.abs(expected.y - actual.y);
  const widthDiff = Math.abs(expected.width - actual.width);
  const heightDiff = Math.abs(expected.height - actual.height);
  
  const isMatch = 
    xDiff <= tolerance &&
    yDiff <= tolerance &&
    widthDiff <= tolerance &&
    heightDiff <= tolerance;
  
  return {
    id: expected.id,
    name: expected.name,
    xDiff,
    yDiff,
    widthDiff,
    heightDiff,
    isMatch,
    expected,
    actual,
  };
}

/**
 * Figma 레이아웃과 DOM 레이아웃 전체 비교
 */
export function compareLayouts(
  figmaLayouts: LayoutData[],
  domLayouts: LayoutData[],
  options?: CompareOptions
): LayoutComparisonResult {
  const domLayoutMap = new Map<string, LayoutData>();
  for (const layout of domLayouts) {
    domLayoutMap.set(layout.id, layout);
  }
  
  const diffs: LayoutDiff[] = [];
  const missingInDom: string[] = [];
  let matchedNodes = 0;
  
  for (const figmaLayout of figmaLayouts) {
    const domLayout = domLayoutMap.get(figmaLayout.id);
    
    if (!domLayout) {
      missingInDom.push(figmaLayout.id);
      continue;
    }
    
    const diff = compareLayout(figmaLayout, domLayout, options);
    diffs.push(diff);
    
    if (diff.isMatch) {
      matchedNodes++;
    }
  }
  
  return {
    totalNodes: figmaLayouts.length,
    matchedNodes,
    mismatchedNodes: diffs.filter(d => !d.isMatch).length,
    missingInDom,
    diffs,
  };
}
