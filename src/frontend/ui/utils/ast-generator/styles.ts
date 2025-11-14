/**
 * Styles 관련 AST 생성
 */

import * as ts from "typescript";
import type { ComponentDSL } from "./types";

/**
 * Styles 객체 생성
 */
export function createStylesObject(
  layoutTree: ComponentDSL["layoutTree"],
  elementIdToStyleKey: Map<string, string>,
): ts.VariableStatement | null {
  if (!layoutTree) return null;

  const styleProperties: ts.PropertyAssignment[] = [];
  const styleKeyUsageCount = new Map<string, number>();
  let styleKeyCounter = 0;

  // 재귀적으로 스타일 수집
  const collectStyles = (
    node: ComponentDSL["layoutTree"],
    parentKey?: string,
  ): void => {
    if (!node) return;

    // 이미 처리된 노드는 건너뛰기
    if (elementIdToStyleKey.has(node.id)) {
      // 이미 스타일이 생성되었지만, 자식 노드는 계속 처리
      if (node.children) {
        node.children.forEach((child) => collectStyles(child));
      }
      return;
    }

    const styleKey = generateStyleKey(
      node.id,
      elementIdToStyleKey,
      styleKeyUsageCount,
      styleKeyCounter,
    );
    styleKeyCounter++;

    // CSS 스타일 객체 생성
    const cssStyle = layoutTreeNodeToCssStyle(node);
    if (Object.keys(cssStyle).length > 0) {
      const styleValue = createObjectLiteralFromCss(cssStyle);
      styleProperties.push(
        ts.factory.createPropertyAssignment(styleKey, styleValue),
      );
    }

    // 자식 노드 재귀 처리
    if (node.children) {
      node.children.forEach((child) => collectStyles(child));
    }
  };

  // Root 스타일 (container)
  const rootCssStyle = layoutTreeNodeToCssStyle(layoutTree);
  if (Object.keys(rootCssStyle).length > 0) {
    const rootStyleValue = createObjectLiteralFromCss(rootCssStyle);
    styleProperties.push(
      ts.factory.createPropertyAssignment("container", rootStyleValue),
    );
  }

  // 자식 노드들 처리
  if (layoutTree.children) {
    layoutTree.children.forEach((child) => collectStyles(child));
  }

  if (styleProperties.length === 0) return null;

  const stylesObject = ts.factory.createObjectLiteralExpression(
    styleProperties,
    true,
  );

  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          "styles",
          undefined,
          undefined,
          stylesObject,
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

/**
 * Style Key 생성 (elementId 기반)
 * elementId를 안전한 JavaScript 식별자로 변환
 */
export function generateStyleKey(
  elementId: string,
  elementIdToStyleKey: Map<string, string>,
  styleKeyUsageCount: Map<string, number>,
  counter: number,
): string {
  if (elementIdToStyleKey.has(elementId)) {
    return elementIdToStyleKey.get(elementId)!;
  }

  // elementId를 안전한 식별자로 변환
  // 예: "11:12884" -> "element_11_12884", "I11:12887;293:22146" -> "element_I11_12887_293_22146"
  const sanitized = elementId
    .replace(/[^a-zA-Z0-9]/g, "_") // 특수문자를 언더스코어로
    .replace(/^([0-9])/, "_$1") // 숫자로 시작하면 앞에 언더스코어 추가
    .replace(/_+/g, "_") // 연속된 언더스코어를 하나로
    .replace(/^_|_$/g, ""); // 앞뒤 언더스코어 제거

  const baseKey = sanitized ? `element_${sanitized}` : `element_${counter}`;

  // 중복 체크: 같은 baseKey가 이미 사용 중이면 카운터 추가
  let styleKey = baseKey;
  if (styleKeyUsageCount.has(baseKey)) {
    const count = styleKeyUsageCount.get(baseKey)! + 1;
    styleKeyUsageCount.set(baseKey, count);
    styleKey = `${baseKey}_${count}`;
  } else {
    styleKeyUsageCount.set(baseKey, 1);
  }

  elementIdToStyleKey.set(elementId, styleKey);
  return styleKey;
}

/**
 * LayoutTreeNode를 CSS 스타일 객체로 변환
 */
export function layoutTreeNodeToCssStyle(
  node: ComponentDSL["layoutTree"],
): Record<string, string | number> {
  if (!node) return {};

  const css: Record<string, string | number> = {};

  // 가시성
  if (node.visible === false) {
    css.display = "none";
    return css;
  }

  // 크기
  if (node.width !== undefined) {
    css.width = `${node.width}px`;
  }
  if (node.height !== undefined) {
    css.height = `${node.height}px`;
  }

  // 배경색 (fills)
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find(
      (fill) => fill.type === "SOLID" && fill.color,
    );
    if (solidFill && solidFill.color) {
      const { r, g, b } = solidFill.color;
      const opacity = solidFill.opacity ?? 1;
      if (opacity < 1) {
        css.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      } else {
        css.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      }
    }
  }

  // 테두리
  if (node.strokes && node.strokes.length > 0) {
    const solidStroke = node.strokes.find(
      (stroke) => stroke.type === "SOLID" && stroke.color,
    );
    if (solidStroke && solidStroke.color) {
      const { r, g, b } = solidStroke.color;
      css.borderColor = `rgb(${r}, ${g}, ${b})`;
    }
  }

  if (node.strokeWeight !== undefined && node.strokeWeight > 0) {
    css.borderWidth = `${node.strokeWeight}px`;
    css.borderStyle = "solid";
  }

  // 모서리 둥글기
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    css.borderRadius = `${node.cornerRadius}px`;
  }

  // 패딩
  if (node.padding) {
    const { top, right, bottom, left } = node.padding;
    if (top === right && right === bottom && bottom === left) {
      css.padding = `${top}px`;
    } else {
      css.paddingTop = `${top}px`;
      css.paddingRight = `${right}px`;
      css.paddingBottom = `${bottom}px`;
      css.paddingLeft = `${left}px`;
    }
  }

  // Flexbox (layoutMode)
  if (node.layoutMode && node.layoutMode !== "NONE") {
    css.display = "flex";
    css.flexDirection = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    if (node.itemSpacing !== undefined) {
      css.gap = `${node.itemSpacing}px`;
    }
    if (node.primaryAxisAlignItems) {
      const alignMap: Record<string, string> = {
        MIN: "flex-start",
        CENTER: "center",
        MAX: "flex-end",
        SPACE_BETWEEN: "space-between",
      };
      css.justifyContent = alignMap[node.primaryAxisAlignItems] || "flex-start";
    }
    if (node.counterAxisAlignItems) {
      const alignMap: Record<string, string> = {
        MIN: "flex-start",
        CENTER: "center",
        MAX: "flex-end",
      };
      css.alignItems = alignMap[node.counterAxisAlignItems] || "flex-start";
    }
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity !== 1) {
    css.opacity = node.opacity;
  }

  return css;
}

/**
 * CSS 스타일 객체를 TypeScript Object Literal로 변환
 */
export function createObjectLiteralFromCss(
  css: Record<string, string | number>,
): ts.ObjectLiteralExpression {
  const properties = Object.entries(css).map(([key, value]) =>
    ts.factory.createPropertyAssignment(
      key,
      typeof value === "string"
        ? ts.factory.createStringLiteral(value)
        : ts.factory.createNumericLiteral(value.toString()),
    ),
  );

  return ts.factory.createObjectLiteralExpression(properties, true);
}
