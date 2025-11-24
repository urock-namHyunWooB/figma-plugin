import type { ElementBindingModel } from "./binding";
import type { PropIR } from "@frontend/ui/domain/transpiler";
import { PrettifierContext } from "@frontend/ui/domain/transpiler/prettifier/strategies/IPrettifierStrategy";
import type { StyleTreeNode } from "./styles";
import type { BaseStyleProperties } from "@backend";
import { FigmaNodeData } from "./figma-api";

// AST 노드 공통
export interface BaseASTNode {
  id: string;
  name: string;
}

export interface ElementASTNode extends BaseASTNode {
  kind: "Element" | "Slot";
  tag: string;
  originalType: string; // Figma node.type 저장
  styles: Record<string, any>;
  figmaStyles?: BaseStyleProperties; // 원본 Figma 스타일 정보 (StyleTreeNode.figmaStyle 참조)
  children: ElementASTNode[];

  bindings: { id: string }[];
  attrs: Record<string, string>; // JSX 요소의 HTML 속성 (예: { disabled: 'isDisabled' })
  textContent?: string | null; // TEXT용 텍스트 (없으면 null)

  // Slot인 경우, 어떤 prop 때문에 slot으로 유추되었는지 (여러 prop과 매칭될 수 있음)
  slotProp?: Array<{
    propId: string;
    propName: string;
  }>;
}

export interface AstTree {
  name: string;
  props: PropIR[];
  styleFeature: {
    /** 공통 baseStyle - variantStyleMap의 모든 variant가 이 객체를 참조 */
    baseStyle?: StyleTreeNode | null;
    variantStyleMap?: PrettifierContext["styleData"]["variantStyleMap"];
  };

  root: ElementASTNode;
  figmaInfo: FigmaNodeData;
}

export interface ComponentAST {
  kind: "Component";
  name: string;
  root: ElementASTNode;
}
