/**
 * 스타일 비교 유틸리티
 * Figma nodeData와 렌더링된 DOM의 CSS 스타일을 비교합니다.
 */

import { FigmaNodeData } from "../types/compiler";

/** 비교할 스타일 속성 */
export interface StyleProperties {
  backgroundColor?: string;
  color?: string;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  fontWeight?: string | number;
  opacity?: number;
  // 레이아웃 속성
  width?: number;
  height?: number;
}

/** 스타일 비교 결과 */
export interface StyleDiff {
  nodeId: string;
  nodeName: string;
  property: string;
  expected: string;
  actual: string;
}

/** 전체 비교 결과 */
export interface StyleComparisonResult {
  totalNodes: number;      // Figma nodeData의 전체 노드 수
  foundInDom: number;      // DOM에서 data-figma-id로 찾은 노드 수
  matchedNodes: number;    // 스타일까지 일치하는 노드 수
  diffs: StyleDiff[];
}

/**
 * Figma RGBA를 CSS rgb() 문자열로 변환
 */
function figmaColorToRgb(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a !== undefined && color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * CSS rgb/rgba 문자열을 정규화 (공백 제거, 소문자)
 */
function normalizeColor(color: string): string {
  return color.toLowerCase().replace(/\s/g, "");
}

/**
 * 두 색상이 같은지 비교 (허용 오차 적용)
 */
function colorsMatch(color1: string, color2: string, tolerance: number = 5): boolean {
  const norm1 = normalizeColor(color1);
  const norm2 = normalizeColor(color2);
  
  // 정확히 같으면 true
  if (norm1 === norm2) return true;
  
  // RGB 값 추출해서 비교
  const rgb1 = parseRgb(norm1);
  const rgb2 = parseRgb(norm2);
  
  if (!rgb1 || !rgb2) return false;
  
  return (
    Math.abs(rgb1.r - rgb2.r) <= tolerance &&
    Math.abs(rgb1.g - rgb2.g) <= tolerance &&
    Math.abs(rgb1.b - rgb2.b) <= tolerance
  );
}

/**
 * CSS 색상 문자열에서 RGB 값 추출
 */
function parseRgb(color: string): { r: number; g: number; b: number } | null {
  // rgb(r, g, b) 또는 rgba(r, g, b, a) 형식
  const rgbMatch = color.match(/rgba?\((\d+),(\d+),(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }
  
  // #rrggbb 형식
  const hexMatch = color.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }
  
  return null;
}

/**
 * 숫자 값 비교 (허용 오차 적용)
 */
function numbersMatch(val1: number, val2: number, tolerance: number = 2): boolean {
  return Math.abs(val1 - val2) <= tolerance;
}

/**
 * CSS 값에서 숫자 추출 (예: "14px" -> 14)
 */
function parseNumber(value: string): number {
  const match = value.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

/**
 * Figma 노드에서 스타일 추출
 */
function extractFigmaStyles(node: any): StyleProperties {
  const styles: StyleProperties = {};
  
  // 레이아웃: width, height (absoluteBoundingBox에서 추출)
  if (node.absoluteBoundingBox) {
    styles.width = node.absoluteBoundingBox.width;
    styles.height = node.absoluteBoundingBox.height;
  }
  
  // backgroundColor (fills에서 추출)
  if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
    const solidFill = node.fills.find((f: any) => f.type === "SOLID" && f.visible !== false);
    if (solidFill?.color) {
      styles.backgroundColor = figmaColorToRgb({
        ...solidFill.color,
        a: solidFill.opacity,
      });
    }
  }
  
  // borderRadius
  if (node.cornerRadius !== undefined) {
    styles.borderRadius = node.cornerRadius;
  }
  
  // border (strokes에서 추출)
  if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const solidStroke = node.strokes.find((s: any) => s.type === "SOLID" && s.visible !== false);
    if (solidStroke?.color) {
      styles.borderColor = figmaColorToRgb(solidStroke.color);
    }
  }
  if (node.strokeWeight !== undefined) {
    styles.borderWidth = node.strokeWeight;
  }
  
  // TEXT 노드 스타일
  if (node.type === "TEXT" && node.style) {
    if (node.style.fontSize) {
      styles.fontSize = node.style.fontSize;
    }
    if (node.style.fontWeight) {
      styles.fontWeight = node.style.fontWeight;
    }
  }
  
  // color (TEXT 노드의 fills)
  if (node.type === "TEXT" && node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find((f: any) => f.type === "SOLID" && f.visible !== false);
    if (solidFill?.color) {
      styles.color = figmaColorToRgb(solidFill.color);
    }
  }
  
  // opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    styles.opacity = node.opacity;
  }
  
  return styles;
}

/**
 * DOM 요소에서 스타일 추출
 */
function extractDomStyles(element: HTMLElement): StyleProperties {
  const computed = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const styles: StyleProperties = {};
  
  // 레이아웃: width, height
  styles.width = rect.width;
  styles.height = rect.height;
  
  // backgroundColor
  const bgColor = computed.backgroundColor;
  if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
    styles.backgroundColor = bgColor;
  }
  
  // color
  const color = computed.color;
  if (color) {
    styles.color = color;
  }
  
  // borderRadius
  const borderRadius = parseNumber(computed.borderRadius);
  if (borderRadius > 0) {
    styles.borderRadius = borderRadius;
  }
  
  // borderColor
  const borderColor = computed.borderColor;
  if (borderColor && borderColor !== "rgb(0, 0, 0)") {
    styles.borderColor = borderColor;
  }
  
  // borderWidth
  const borderWidth = parseNumber(computed.borderWidth);
  if (borderWidth > 0) {
    styles.borderWidth = borderWidth;
  }
  
  // fontSize
  const fontSize = parseNumber(computed.fontSize);
  if (fontSize > 0) {
    styles.fontSize = fontSize;
  }
  
  // fontWeight
  const fontWeight = computed.fontWeight;
  if (fontWeight) {
    styles.fontWeight = fontWeight;
  }
  
  // opacity
  const opacity = parseFloat(computed.opacity);
  if (opacity < 1) {
    styles.opacity = opacity;
  }
  
  return styles;
}

/**
 * 두 스타일을 비교
 */
function compareStyles(
  nodeId: string,
  nodeName: string,
  figmaStyles: StyleProperties,
  domStyles: StyleProperties
): StyleDiff[] {
  const diffs: StyleDiff[] = [];
  
  // width 비교 (허용 오차 2px)
  if (figmaStyles.width !== undefined && domStyles.width !== undefined) {
    if (!numbersMatch(figmaStyles.width, domStyles.width, 2)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "width",
        expected: `${figmaStyles.width}px`,
        actual: `${domStyles.width}px`,
      });
    }
  }
  
  // height 비교 (허용 오차 2px)
  if (figmaStyles.height !== undefined && domStyles.height !== undefined) {
    if (!numbersMatch(figmaStyles.height, domStyles.height, 2)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "height",
        expected: `${figmaStyles.height}px`,
        actual: `${domStyles.height}px`,
      });
    }
  }
  
  // backgroundColor 비교
  if (figmaStyles.backgroundColor && domStyles.backgroundColor) {
    if (!colorsMatch(figmaStyles.backgroundColor, domStyles.backgroundColor)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "backgroundColor",
        expected: figmaStyles.backgroundColor,
        actual: domStyles.backgroundColor,
      });
    }
  }
  
  // color 비교
  if (figmaStyles.color && domStyles.color) {
    if (!colorsMatch(figmaStyles.color, domStyles.color)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "color",
        expected: figmaStyles.color,
        actual: domStyles.color,
      });
    }
  }
  
  // borderRadius 비교
  if (figmaStyles.borderRadius !== undefined && domStyles.borderRadius !== undefined) {
    if (!numbersMatch(figmaStyles.borderRadius, domStyles.borderRadius)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "borderRadius",
        expected: `${figmaStyles.borderRadius}px`,
        actual: `${domStyles.borderRadius}px`,
      });
    }
  }
  
  // borderColor 비교
  if (figmaStyles.borderColor && domStyles.borderColor) {
    if (!colorsMatch(figmaStyles.borderColor, domStyles.borderColor)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "borderColor",
        expected: figmaStyles.borderColor,
        actual: domStyles.borderColor,
      });
    }
  }
  
  // fontSize 비교
  if (figmaStyles.fontSize !== undefined && domStyles.fontSize !== undefined) {
    if (!numbersMatch(figmaStyles.fontSize, domStyles.fontSize)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "fontSize",
        expected: `${figmaStyles.fontSize}px`,
        actual: `${domStyles.fontSize}px`,
      });
    }
  }
  
  // opacity 비교
  if (figmaStyles.opacity !== undefined && domStyles.opacity !== undefined) {
    if (!numbersMatch(figmaStyles.opacity, domStyles.opacity, 0.05)) {
      diffs.push({
        nodeId,
        nodeName,
        property: "opacity",
        expected: String(figmaStyles.opacity),
        actual: String(domStyles.opacity),
      });
    }
  }
  
  return diffs;
}

/**
 * Figma nodeData의 모든 노드에서 스타일 맵 추출
 */
function collectFigmaStylesMap(nodeData: FigmaNodeData): Map<string, { name: string; styles: StyleProperties }> {
  const map = new Map<string, { name: string; styles: StyleProperties }>();
  
  function traverse(node: any) {
    if (node.id) {
      const styles = extractFigmaStyles(node);
      if (Object.keys(styles).length > 0) {
        map.set(node.id, { name: node.name || "Unknown", styles });
      }
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  }
  
  traverse(nodeData.info.document);
  return map;
}

/**
 * 렌더링된 컨테이너에서 모든 data-figma-id 요소의 스타일 추출
 */
function collectDomStylesMap(container: HTMLElement): Map<string, StyleProperties> {
  const map = new Map<string, StyleProperties>();
  
  const elements = container.querySelectorAll("[data-figma-id]");
  elements.forEach((el) => {
    const figmaId = el.getAttribute("data-figma-id");
    if (figmaId) {
      map.set(figmaId, extractDomStyles(el as HTMLElement));
    }
  });
  
  return map;
}

/**
 * Figma nodeData와 렌더링된 DOM의 스타일 비교
 */
export function compareNodeStyles(
  nodeData: FigmaNodeData,
  container: HTMLElement
): StyleComparisonResult {
  const figmaStylesMap = collectFigmaStylesMap(nodeData);
  const domStylesMap = collectDomStylesMap(container);
  
  const diffs: StyleDiff[] = [];
  let foundInDom = 0;
  let matchedNodes = 0;
  
  figmaStylesMap.forEach(({ name, styles: figmaStyles }, nodeId) => {
    const domStyles = domStylesMap.get(nodeId);
    
    if (domStyles) {
      foundInDom++;
      const nodeDiffs = compareStyles(nodeId, name, figmaStyles, domStyles);
      if (nodeDiffs.length === 0) {
        matchedNodes++;
      } else {
        diffs.push(...nodeDiffs);
      }
    }
  });
  
  return {
    totalNodes: figmaStylesMap.size,
    foundInDom,
    matchedNodes,
    diffs,
  };
}

/**
 * 스타일 비교 결과를 상태로 변환
 */
export function getStyleComparisonStatus(result: StyleComparisonResult): "success" | "warning" | "error" {
  if (result.diffs.length === 0) {
    return "success";
  }
  
  // 색상 차이만 있으면 warning
  const hasColorDiffOnly = result.diffs.every(
    (d) => d.property === "color" || d.property === "backgroundColor"
  );
  
  if (hasColorDiffOnly && result.diffs.length <= 3) {
    return "warning";
  }
  
  if (result.diffs.length > 5) {
    return "error";
  }
  
  return "warning";
}
