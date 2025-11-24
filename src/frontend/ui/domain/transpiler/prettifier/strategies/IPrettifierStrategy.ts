import type {
  BindingModel,
  ComponentAST,
  ElementASTNode,
  PropIR,
  VariantStyleIR,
} from "../../types";
import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { StyleTreeNode } from "@frontend/ui/domain/transpiler/types/styles";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";

/**
 * 타입별 prettify 전략 인터페이스
 * 추후 Text, Button 등 타입별로 다른 prettify 로직을 적용할 수 있도록 확장 가능
 */
export interface IPrettifierStrategy {
  /**
   * 노드를 prettify 처리
   */
  prettifyNode(ast: AstTree): AstTree;

  /**
   * 이 전략이 적용 가능한지 확인
   */
  canHandle(ast: AstTree): boolean;
}

/**
 * Prettifier 실행 컨텍스트
 */
export interface PrettifierContext {
  ast: AstTree;
  propsData: PropIR[];
  styleData: {
    styleTree: StyleTreeNode | null;
    variantStyleMap: Map<string, VariantStyleIR>;
  };
  baseStyle?: StyleTreeNode | null; // 공통 baseStyle

  bindingData: BindingModel;
  slots?: Array<{ elementId: string; propId: string; propName: string }>;
}
