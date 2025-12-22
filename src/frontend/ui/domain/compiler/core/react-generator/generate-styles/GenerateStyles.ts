import ts, { NodeFactory, factory } from "typescript";
import { traverseBFS } from "@compiler/utils/traverse";
import { FinalAstTree } from "../../../types/customType";
import TypescriptNodeKitManager from "../../../manager/TypescriptNodeKitManager";

class GenerateStyles {
  private factory: NodeFactory;
  private astTree: FinalAstTree;
  private kit: TypescriptNodeKitManager;

  constructor(factory: NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;
    this.kit = new TypescriptNodeKitManager(this.factory);
  }

  public createStyleVariables(): ts.VariableStatement {
    const styleVariables: ts.VariableDeclaration[] = [];

    traverseBFS(this.astTree, (node) => {
      /**
       * style의 base를 읽어서 name + Css 함수를 만든다.
       * style의 dynamic을 읽어서 props에 해당하는 name + By + props유형 = {[값]: [style 값]}을 만든다.
       *
       * ex)
       * const primaryButtonBySize = {Large: {padding: 8px} }
       *
       * const primaryButtonCss = {$size: Size} => css`
       *  align-items: center;
       *   background: var(--Primary-600, #15c5ce);
       *   border-radius: 4px;
       *   display: inline-flex;
       *   flex-direction: column;
       *   justify-content: center;
       *
       *   ${paddingBySize[$size]}
       *
       *   &:active {
       *     background: var(--Primary-700, #00abb6);
       *   }
       *
       *   &:disabled {
       *     background: var(--Primary-300, #b0ebec);
       *   }
       *
       *   &:hover {
       *     cursor: pointer;
       *     background: var(--Primary-500, #47cfd6);
       *   }
       * `
       */

      styleVariables.push(this._createCssObject(node));
      node.style.base;
    });
  }

  private _createCssObject(node: FinalAstTree) {
    // 1. dynamic 스타일에서 Record 객체 생성
    if (node.style.dynamic && node.style.dynamic.length > 0) {
      // dynamic을 variant별로 그룹화
      const variantMap = new Map<string, Record<string, any>>();

      node.style.dynamic.forEach(({ condition, style }) => {
        // condition에서 variant 값 추출 (예: props.size === "Large")
        // ... 조건 파싱 로직 ...
        const variantValue = "Large"; // 예시
        variantMap.set(variantValue, style);
      });

      // Record 객체 생성: { Large: { padding: "8px" }, ... }
      const recordEntries = Array.from(variantMap.entries()).map(
        ([key, value]) => ({
          key,
          value: this.kit.createObjectLiteral(
            Object.entries(value).map(([k, v]) => ({
              key: k,
              value: this.kit.createStringLiteral(String(v)), // 또는 적절한 타입 변환
            }))
          ),
        })
      );

      const recordObject = this.kit.createRecordObject(recordEntries);

      // 변수명: node.name + "By" + propType (예: "primaryButtonBySize")
      const varName = `${node.name}BySize`;
      const recordVar = this.kit.createConstVariable(varName, recordObject);

      return recordVar;
    }
  }
}

export default GenerateStyles;
