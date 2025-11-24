import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type { AstTree, ComponentAST } from "./ast";
import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import type { PropIR } from "./props";
import type { BindingModel } from "./binding";
import { VariantStyleIR } from "./styles";

/**
 * Figma ComponentSetNodeSpec을 ComponentAST로 변환하는 인터페이스
 */
export interface IASTGenerator {
  /**
   * ComponentSetNodeSpec을 ComponentAST로 변환
   * @param spec ComponentSetNodeSpec
   * @param bindingModel Optional binding 모델 (요소에 binding 정보를 연결하기 위해 사용)
   */
  dslSpecToAST(
    spec: ComponentSetNodeSpec,
    bindingModel?: BindingModel,
  ): AstTree;
}

/**
 * ComponentAST를 코드 문자열로 변환하는 인터페이스
 */
export interface ICodeGenerator {
  /**
   * ComponentAST를 TSX 코드 문자열로 변환
   * @param ast ComponentAST
   * @param propsIR Props IR 배열
   * @param variantStyleMap Variant style 맵
   * @param bindingModel Optional binding 모델 (state, props 바인딩 등에 사용)
   */
  generateComponentTSXWithTS(
    ast: ComponentAST,
    propsIR: PropIR[],
    variantStyleMap: Map<string, VariantStyleIR>,
    bindingModel?: BindingModel,
  ): string;
}

/**
 * ComponentAST를 정리하고 최적화하는 인터페이스
 */
export interface IPrettifier {
  /**
   * ComponentAST를 정리하여 반환
   */
  prettify({
    ast,
    bindingData,
    propsData,
    styleData,
  }: {
    ast: ComponentAST;
    propsData: PropIR[];
    styleData: {
      layoutTree: ComponentSetNodeSpec["layoutTree"];
      variantStyleMap: Map<string, VariantStyleIR>;
    };

    bindingData: BindingModel;
  }): {
    ast: ComponentAST;
  };
}

/**
 * Figma 노드 타입을 HTML 태그로 매핑하는 인터페이스
 */
export interface ITagMapper {
  /**
   * Figma 노드 타입을 HTML 태그로 변환
   */
  mapFigmaTypeToTag(type: string): string;
}

/**
 * Layout 노드를 스타일 객체로 변환하는 인터페이스
 */
export interface IStyleConverter {
  /**
   * Layout 노드와 Figma 타입을 기반으로 스타일 객체 생성
   */
  layoutNodeToStyle(
    node: LayoutTreeNode | undefined,
    figmaType: string,
  ): Record<string, any>;
}
