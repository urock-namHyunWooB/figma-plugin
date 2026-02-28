/**
 * 스타일 비교 유틸리티
 * Figma nodeData와 렌더링된 DOM의 CSS 스타일을 비교합니다.
 */

import type { FigmaNodeData } from "@code-generator2";

export interface StyleProperties {
  backgroundColor?: string;
  color?: string;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  fontWeight?: string | number;
  opacity?: number;
  width?: number;
  height?: number;
}

export interface StyleDiff {
  nodeId: string;
  nodeName: string;
  property: string;
  expected: string;
  actual: string;
}

export interface StyleComparisonResult {
  totalNodes: number;
  foundInDom: number;
  matchedNodes: number;
  diffs: StyleDiff[];
}

function figmaColorToRgb(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a !== undefined && color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function normalizeColor(color: string): string {
  return color.toLowerCase().replace(/\s/g, "");
}

function colorsMatch(color1: string, color2: string, tolerance: number = 5): boolean {
  const norm1 = normalizeColor(color1);
  const norm2 = normalizeColor(color2);

  if (norm1 === norm2) return true;

  const rgb1 = parseRgb(norm1);
  const rgb2 = parseRgb(norm2);

  if (!rgb1 || !rgb2) return false;

  return (
    Math.abs(rgb1.r - rgb2.r) <= tolerance &&
    Math.abs(rgb1.g - rgb2.g) <= tolerance &&
    Math.abs(rgb1.b - rgb2.b) <= tolerance
  );
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const rgbMatch = color.match(/rgba?\((\d+),(\d+),(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }

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

function numbersMatch(val1: number, val2: number, tolerance: number = 2): boolean {
  return Math.abs(val1 - val2) <= tolerance;
}

function parseNumber(value: string): number {
  const match = value.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function extractFigmaStyles(node: any): StyleProperties {
  const styles: StyleProperties = {};

  if (node.absoluteBoundingBox) {
    styles.width = node.absoluteBoundingBox.width;
    styles.height = node.absoluteBoundingBox.height;
  }

  if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
    const solidFill = node.fills.find((f: any) => f.type === "SOLID" && f.visible !== false);
    if (solidFill?.color) {
      styles.backgroundColor = figmaColorToRgb({
        ...solidFill.color,
        a: solidFill.opacity,
      });
    }
  }

  if (node.cornerRadius !== undefined) {
    styles.borderRadius = node.cornerRadius;
  }

  if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const solidStroke = node.strokes.find((s: any) => s.type === "SOLID" && s.visible !== false);
    if (solidStroke?.color) {
      styles.borderColor = figmaColorToRgb(solidStroke.color);
    }
  }
  if (node.strokeWeight !== undefined) {
    styles.borderWidth = node.strokeWeight;
  }

  if (node.type === "TEXT" && node.style) {
    if (node.style.fontSize) {
      styles.fontSize = node.style.fontSize;
    }
    if (node.style.fontWeight) {
      styles.fontWeight = node.style.fontWeight;
    }
  }

  if (node.type === "TEXT" && node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find((f: any) => f.type === "SOLID" && f.visible !== false);
    if (solidFill?.color) {
      styles.color = figmaColorToRgb(solidFill.color);
    }
  }

  if (node.opacity !== undefined && node.opacity < 1) {
    styles.opacity = node.opacity;
  }

  return styles;
}

function extractDomStyles(element: HTMLElement): StyleProperties {
  const computed = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const styles: StyleProperties = {};

  styles.width = rect.width;
  styles.height = rect.height;

  const bgColor = computed.backgroundColor;
  if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
    styles.backgroundColor = bgColor;
  }

  const color = computed.color;
  if (color) {
    styles.color = color;
  }

  const borderRadius = parseNumber(computed.borderRadius);
  if (borderRadius > 0) {
    styles.borderRadius = borderRadius;
  }

  const borderColor = computed.borderColor;
  if (borderColor && borderColor !== "rgb(0, 0, 0)") {
    styles.borderColor = borderColor;
  }

  const borderWidth = parseNumber(computed.borderWidth);
  if (borderWidth > 0) {
    styles.borderWidth = borderWidth;
  }

  const fontSize = parseNumber(computed.fontSize);
  if (fontSize > 0) {
    styles.fontSize = fontSize;
  }

  const fontWeight = computed.fontWeight;
  if (fontWeight) {
    styles.fontWeight = fontWeight;
  }

  const opacity = parseFloat(computed.opacity);
  if (opacity < 1) {
    styles.opacity = opacity;
  }

  return styles;
}

function compareStyles(
  nodeId: string,
  nodeName: string,
  figmaStyles: StyleProperties,
  domStyles: StyleProperties
): StyleDiff[] {
  const diffs: StyleDiff[] = [];

  if (figmaStyles.width !== undefined && domStyles.width !== undefined) {
    if (!numbersMatch(figmaStyles.width, domStyles.width, 2)) {
      diffs.push({
        nodeId, nodeName, property: "width",
        expected: `${figmaStyles.width}px`, actual: `${domStyles.width}px`,
      });
    }
  }

  if (figmaStyles.height !== undefined && domStyles.height !== undefined) {
    if (!numbersMatch(figmaStyles.height, domStyles.height, 2)) {
      diffs.push({
        nodeId, nodeName, property: "height",
        expected: `${figmaStyles.height}px`, actual: `${domStyles.height}px`,
      });
    }
  }

  if (figmaStyles.backgroundColor && domStyles.backgroundColor) {
    if (!colorsMatch(figmaStyles.backgroundColor, domStyles.backgroundColor)) {
      diffs.push({
        nodeId, nodeName, property: "backgroundColor",
        expected: figmaStyles.backgroundColor, actual: domStyles.backgroundColor,
      });
    }
  }

  if (figmaStyles.color && domStyles.color) {
    if (!colorsMatch(figmaStyles.color, domStyles.color)) {
      diffs.push({
        nodeId, nodeName, property: "color",
        expected: figmaStyles.color, actual: domStyles.color,
      });
    }
  }

  if (figmaStyles.borderRadius !== undefined && domStyles.borderRadius !== undefined) {
    if (!numbersMatch(figmaStyles.borderRadius, domStyles.borderRadius)) {
      diffs.push({
        nodeId, nodeName, property: "borderRadius",
        expected: `${figmaStyles.borderRadius}px`, actual: `${domStyles.borderRadius}px`,
      });
    }
  }

  if (figmaStyles.borderColor && domStyles.borderColor) {
    if (!colorsMatch(figmaStyles.borderColor, domStyles.borderColor)) {
      diffs.push({
        nodeId, nodeName, property: "borderColor",
        expected: figmaStyles.borderColor, actual: domStyles.borderColor,
      });
    }
  }

  if (figmaStyles.fontSize !== undefined && domStyles.fontSize !== undefined) {
    if (!numbersMatch(figmaStyles.fontSize, domStyles.fontSize)) {
      diffs.push({
        nodeId, nodeName, property: "fontSize",
        expected: `${figmaStyles.fontSize}px`, actual: `${domStyles.fontSize}px`,
      });
    }
  }

  if (figmaStyles.opacity !== undefined && domStyles.opacity !== undefined) {
    if (!numbersMatch(figmaStyles.opacity, domStyles.opacity, 0.05)) {
      diffs.push({
        nodeId, nodeName, property: "opacity",
        expected: String(figmaStyles.opacity), actual: String(domStyles.opacity),
      });
    }
  }

  return diffs;
}

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

  traverse((nodeData as any).info.document);
  return map;
}

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

export function getStyleComparisonStatus(result: StyleComparisonResult): "success" | "warning" | "error" {
  if (result.diffs.length === 0) {
    return "success";
  }

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
