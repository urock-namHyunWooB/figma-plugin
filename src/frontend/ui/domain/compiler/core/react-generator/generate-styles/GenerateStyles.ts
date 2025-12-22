import ts, { NodeFactory, factory } from "typescript";
import { traverseBFS } from "@compiler/utils/traverse";
import { FinalAstTree } from "../../../types/customType";

class GenerateStyles {
  private factory: NodeFactory;
  private astTree: FinalAstTree;

  constructor(factory: NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;
  }

  public createStyleVariables(): ts.VariableStatement {
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
    });
  }
}

export default GenerateStyles;
