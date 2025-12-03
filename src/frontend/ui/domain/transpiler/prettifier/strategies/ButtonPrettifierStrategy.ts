import type { PropIR, UnifiedNode } from "../../types";
import {
  traverseUnifiedNode,
  UnifiedNodePath,
} from "../../utils/ast-tree-utils";
import { DefaultPrettifierStrategy } from "./DefaultPrettifierStrategy";
import { isButtonLike } from "@frontend/ui/domain/transpiler/prettifier/utils/isButtonLike";

/**
 * Button 타입 컴포넌트용 prettify 전략
 */
export class ButtonPrettifierStrategy extends DefaultPrettifierStrategy {
  constructor() {
    super();
  }

  public canHandle(ast: UnifiedNode): boolean {
    // 기본 버튼 추론
    if (!isButtonLike(ast)) {
      return false;
    }

    // TODO: Variant 패턴 체크 - UnifiedNode 구조에 맞게 수정 필요
    // 현재는 기본 추론 결과만 반환
    return true;
  }

  public prettifyNode(
    ast: UnifiedNode,
    props: PropIR[]
  ): { unifiedNode: UnifiedNode; props: PropIR[] } {
    super.deleteMargin(ast);
    super.normalizeNodes(ast);

    // TODO: UnifiedNode 구조에 맞게 아래 메서드들 재구현 필요
    // this.transformStateToIsDisabled(ast, props);
    // this.bindPropsToAttrs(ast, props);
    // this.editStyle(ast);
    this.normalizeProps(ast, props);
    // this.bindPropsToNodes(ast, props);

    return {
      unifiedNode: ast,
      props: props,
    };
  }

  /**
   * TODO: state variant prop을 제거하고
   * variantStyleMap에 :state 키로 상태별 스타일 저장 (CSS 의사 클래스로 적용)
   * UnifiedNode 구조에 맞게 재구현 필요
   */
  private transformStateToIsDisabled(
    _ast: UnifiedNode,
    _props: PropIR[]
  ): void {
    // TODO: Implement for UnifiedNode structure
  }

  /**
   * TODO: root 태그가 네이티브 button일 때,
   * props에 isDisabled, disable, disabled 같은 Boolean 형태의 값이 있으면
   * root 노드의 attrs에 바인딩
   */
  private bindPropsToAttrs(_ast: UnifiedNode, _props: PropIR[]): void {
    // TODO: Implement for UnifiedNode structure
  }

  private normalizeProps(_ast: UnifiedNode, props: PropIR[]): void {
    /**
     * prop에 text 및 label : string 형태가 없다면 prop에 text: string 형태를 추가한다.
     */

    // text 또는 label prop이 있는지 확인 (TEXT 타입)
    const hasTextOrLabelProp = props.some(
      (prop) =>
        (prop.normalizedName.toLowerCase() === "text" ||
          prop.normalizedName.toLowerCase() === "label") &&
        prop.type === "TEXT"
    );

    // text나 label prop이 없으면 text prop 추가
    if (!hasTextOrLabelProp) {
      props.push({
        id: `custom-text`,
        originalName: "text",
        normalizedName: "text",
        type: "TEXT",
        required: true,
        optional: false,
      });
    }
  }

  private bindPropsToNodes(ast: UnifiedNode, props: PropIR[]) {
    // text prop 찾기 (normalizedName이 "text"이고 type이 "TEXT")
    const textProp = props.find(
      (prop) =>
        prop.normalizedName.toLowerCase() === "text" && prop.type === "TEXT"
    );

    if (!textProp) {
      return; // text prop이 없으면 아무것도 하지 않음
    }

    // TODO: UnifiedNode 구조에서 TEXT 타입 노드 찾아서 처리
    traverseUnifiedNode(ast, (path: UnifiedNodePath) => {
      if (path.node.type === "TEXT") {
        // TODO: Slot 바인딩 처리 - UnifiedNode 구조에 맞게 구현
      }
    });
  }

  private editStyle(_ast: UnifiedNode) {
    // TODO: 자식 요소가 하나밖에 없으면 처리
  }

  private _disableBinding(_ast: UnifiedNode, _props: PropIR[]) {
    // TODO: disabled 바인딩 처리 - UnifiedNode 구조에 맞게 구현
  }
}
