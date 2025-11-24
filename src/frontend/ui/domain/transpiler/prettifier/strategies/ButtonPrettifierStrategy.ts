import type { ComponentAST, ElementASTNode, VariantStyleIR } from "../../types";
import { traverseAST } from "../../utils/ast-tree-utils";

import { DefaultPrettifierStrategy } from "./DefaultPrettifierStrategy";
import { isButtonLike } from "@frontend/ui/domain/transpiler/prettifier/utils/isButtonLike";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";

/**
 * Button 타입 컴포넌트용 prettify 전략
 *
 */
export class ButtonPrettifierStrategy extends DefaultPrettifierStrategy {
  constructor() {
    super();
  }

  public canHandle(ast: AstTree): boolean {
    // 기본 버튼 추론
    if (!isButtonLike(ast.root)) {
      return false;
    }

    // Variant 패턴 체크: State variant가 있으면 버튼일 가능성 높음
    const hasStateVariant = ast.props.some(
      (prop) =>
        prop.type === "VARIANT" &&
        prop.normalizedName.toLowerCase() === "state" &&
        prop.variantOptions?.some(
          (option) =>
            option.toLowerCase().includes("default") ||
            option.toLowerCase().includes("hover") ||
            option.toLowerCase().includes("pressed") ||
            option.toLowerCase().includes("disabled")
        )
    );

    // State variant가 있으면 버튼으로 확신
    if (hasStateVariant) {
      return true;
    }

    // State variant가 없어도 기본 추론 결과 반환
    return true;
  }

  public prettifyNode(ast: AstTree) {
    super.normalizeText(ast);
    super.convertKind(ast);
    super.convertBooleanProp(ast);
    super.deleteMargin(ast);
    super.normalizeNodes(ast);
    super.normalizeStyles(ast);
    ast.root.tag = "button";

    delete ast.styleFeature.baseStyle?.style.width;

    this.transformStateToIsDisabled(ast);

    this.bindPropsToAttrs(ast);

    this.editStyle(ast);

    this.normalizeProps(ast);

    this.bindPropsToNodes(ast);

    return ast;
  }

  /**
   * state variant prop을 제거하고
   * variantStyleMap에 :state 키로 상태별 스타일 저장 (CSS 의사 클래스로 적용)
   */
  private transformStateToIsDisabled(ast: AstTree): void {
    const propsData = ast.props;
    const styleData = ast.styleFeature;

    if (!styleData.variantStyleMap) {
      return console.warn("variantStyleMap is not exist");
    }

    // state prop 찾기 (normalizedName이 "state"인 것)
    const statePropIndex = propsData.findIndex(
      (prop) => prop.normalizedName.toLowerCase() === "state"
    );

    if (statePropIndex === -1) {
      return; // state prop이 없으면 아무것도 하지 않음
    }

    const stateProp = propsData[statePropIndex];

    // VARIANT 타입이 아니거나 옵션이 없으면 아무것도 하지 않음
    if (stateProp.type !== "VARIANT" || !stateProp.variantOptions) {
      return;
    }

    // variantStyleMap에서 원래 "State" prop의 스타일 찾기
    const stateVariantStyleEntry = Array.from(
      styleData.variantStyleMap.entries()
    ).find(([key]) => key.toLowerCase() === "state");

    if (!stateVariantStyleEntry) {
      // state prop 제거하고 종료
      propsData.splice(statePropIndex, 1);
      return;
    }

    const [stateVariantStyleKey, stateVariantStyle] = stateVariantStyleEntry;

    // state prop 제거
    propsData.splice(statePropIndex, 1);

    propsData.push({
      id: `custom-isDisabled`,
      originalName: "isDisabled",
      normalizedName: "isDisabled",
      type: "BOOLEAN",
      required: false,
      optional: true,
      defaultValue: false,
    });

    // variantStyleMap에서 원래 "State" prop 제거 (실제 키 사용)
    styleData.variantStyleMap.delete(stateVariantStyleKey);

    // :state 키로 상태별 스타일 매핑 생성
    // state 옵션을 상태값으로 변환: "Disabled" → "disabled", "Hover" → "hover", "Pressed" → "pressed"
    // 이 스타일들은 CSS 의사 클래스로 적용됨 (":hover", ":active", ":disabled")
    const stateOptionToStateKey: Record<string, string> = {
      default: "default",
      hover: "hover",
      pressed: "pressed",
      disabled: "disabled",
      disable: "disabled",
    };

    const stateStyles: Record<
      string,
      import("../../types/styles").StyleTreeNode | null
    > = {};
    for (const [optionValue, deltaStyleTree] of Object.entries(
      stateVariantStyle.variantStyles
    )) {
      const normalizedOption = optionValue.toLowerCase();
      const stateKey = stateOptionToStateKey[normalizedOption];

      // 매핑이 있는 경우에만 추가
      if (stateKey) {
        stateStyles[stateKey] = deltaStyleTree;
      }
    }

    // :state 키로 VariantStyleIR 생성
    const stateVariantStyleIR: VariantStyleIR = {
      id: ":state",
      propName: ":state",
      baseStyle: stateVariantStyle.baseStyle,
      variantStyles: stateStyles,
    };

    styleData.variantStyleMap.set(":state", stateVariantStyleIR);
  }

  /**
   * root 태그가 네이티브 button일 때,
   * props에 isDisabled, disable, disabled 같은 Boolean 형태의 값이 있으면
   * root 노드의 attrs에 바인딩
   */

  private bindPropsToAttrs(ast: AstTree): void {}

  private normalizeProps(ast: AstTree): void {
    /**
     * prop에 text 및 label : string 형태가 없다면 prop에 text: string 형태를 추가한다.
     */
    const props = ast.props;

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

  private bindPropsToNodes(ast: AstTree) {
    this._disableBinding(ast);

    /**
     * originType이 'TEXT'인 노드라면 props의 text prop을 해당 노드에 바인딩 하고
     * kind를 'SLOT'으로 변경한다.
     */
    const props = ast.props;

    // text prop 찾기 (normalizedName이 "text"이고 type이 "TEXT")
    const textProp = props.find(
      (prop) =>
        prop.normalizedName.toLowerCase() === "text" && prop.type === "TEXT"
    );

    if (!textProp) {
      return; // text prop이 없으면 아무것도 하지 않음
    }

    // originalType이 "TEXT"인 노드를 찾아서 Slot으로 변경하고 text prop 바인딩
    traverseAST(ast.root, (path) => {
      if (path.node.originalType === "TEXT") {
        // kind를 Slot으로 변경
        path.node.kind = "Slot";

        // bindings 초기화 (없으면 빈 배열)
        if (!path.node.bindings) {
          path.node.bindings = [];
        }

        // bindings에 text prop id 추가 (중복 방지)
        const hasBinding = path.node.bindings.some(
          (binding) => binding.id === textProp.id
        );

        if (!hasBinding) {
          path.node.bindings.push({ id: textProp.id });
        }

        // slotProp 설정 (기존 slotProp이 있으면 유지하고 추가)
        if (!path.node.slotProp) {
          path.node.slotProp = [];
        }

        // 이미 같은 propId가 있는지 확인
        const hasTextProp = path.node.slotProp.some(
          (slot) => slot.propId === textProp.id
        );

        if (!hasTextProp) {
          path.node.slotProp.push({
            propId: textProp.id,
            propName: textProp.normalizedName,
          });
        }
      }
    });
  }

  private editStyle(ast: AstTree) {
    // 자식 요소가 하나밖에 없으면
  }

  private _disableBinding(ast: AstTree) {
    const { props: propsData } = ast;

    if (ast.root.tag !== "button") {
      return;
    }

    // disabled 관련 prop 이름 패턴
    const disabledPropPatterns = [
      "isdisabled",
      "disable",
      "disabled",
      "isDisabled",
    ];

    // propsData에서 Boolean 타입이고 disabled 관련 이름을 가진 prop 찾기
    const disabledProp = propsData.find(
      (prop) =>
        prop.type === "BOOLEAN" &&
        disabledPropPatterns.includes(prop.normalizedName.toLowerCase())
    );

    if (!disabledProp) {
      return;
    }

    ast.root.attrs["disabled"] = disabledProp.normalizedName;
  }
}
