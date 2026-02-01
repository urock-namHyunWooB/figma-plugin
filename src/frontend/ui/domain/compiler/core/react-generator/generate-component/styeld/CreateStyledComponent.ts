import ts, { NodeFactory } from "typescript";
import { FinalAstTree } from "@compiler";

class CreateStyledComponent {
  private factory: NodeFactory;
  private astTree: FinalAstTree;
  constructor(factory: NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;
  }

  /**
   * styled-component 생성 예시
   *
   * 결과물:
   * const PrimaryButton = styled.button<{ $size: Size }>`
   *   align-items: center;
   *   background: var(--Primary-600, #15c5ce);
   *   ${({ $size }) => paddingBySize[$size]};
   *   &:hover { background: var(--Primary-500, #47cfd6); }
   * `;
   */
  public createStyledComponent(): ts.VariableStatement {
    const styledButton = this.factory.createPropertyAccessExpression(
      this.factory.createIdentifier("styled"),
      this.factory.createIdentifier("button")
    );

    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier("PrimaryButton"),
            undefined,
            undefined,
            styledButton
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * 간단한 styled-component 예시 (제네릭 없음)
   * const Content = styled.span`...`;
   */
  public createSimpleStyledComponentExample(): ts.VariableStatement {
    const styledSpan = this.factory.createPropertyAccessExpression(
      this.factory.createIdentifier("styled"),
      this.factory.createIdentifier("span")
    );

    const templateHead = this.factory.createTemplateHead(
      "display: inline-flex;"
    );

    const templateExpression = this.factory.createTemplateExpression(
      templateHead,
      []
    );

    const styledCall = this.factory.createCallExpression(
      styledSpan,
      undefined,
      [templateExpression]
    );

    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier("Content"),
            undefined,
            undefined,
            styledCall
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }
}

export default CreateStyledComponent;
