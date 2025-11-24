import { BaseStyleProperties } from "@backend";
import type { CSSStyleValue } from "@backend/managers/ComponentStructureManager";
import { CssStyleObject } from "../transform/style/figmaStyleToCss";

export interface VariantStyleIR {
  id: string;
  /** Variant prop 이름 (예: "Size", "State") */
  propName: string;
  /** Base style (layoutTree 기준으로 생성된 기본 스타일, 트리 형태) */
  baseStyle: StyleTreeNode | null;
  /** 각 옵션 값별 스타일 델타 (baseStyle과의 차이만 저장, 트리 형태) */
  variantStyles: Record<string, StyleTreeNode | null>;
}

/**
 * Style Tree 노드 타입
 * layoutTree와 1:1 매칭되며 각 노드의 CSS 스타일을 포함
 */
export interface StyleTreeNode {
  id: string;
  style: CSSStyleValue;
  figmaStyle: BaseStyleProperties;
  children: StyleTreeNode[];
}
