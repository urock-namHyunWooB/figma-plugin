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
  public createStyledComponentExample(): ts.VariableStatement {
    // 1. styled 식별자
    const styledIdentifier = this.factory.createIdentifier("styled");

    // 2. styled.button 프로퍼티 접근
    const styledButton = this.factory.createPropertyAccessExpression(
      styledIdentifier,
      this.factory.createIdentifier("button")
    );

    // 3. 제네릭 타입 파라미터: <{ $size: Size }>
    const genericType = [
      this.factory.createTypeLiteralNode([
        this.factory.createPropertySignature(
          undefined,
          this.factory.createIdentifier("$size"),
          undefined,
          this.factory.createTypeReferenceNode(
            this.factory.createIdentifier("Size"),
            undefined
          )
        ),
      ]),
    ];

    // 4. Template literal 생성
    // 템플릿 부분들: ["align-items: center;\n", "${...}", ";\n&:hover { ... }\n"]
    const templateHead = this.factory.createTemplateHead(
      "align-items: center;\nbackground: var(--Primary-600, #15c5ce);\nborder-radius: 4px;\ndisplay: inline-flex;\nflex-direction: column;\njustify-content: center;\n\n"
    );

    // ${({ $size }) => paddingBySize[$size]} 표현식 생성
    const arrowFunctionCorrect = this.factory.createArrowFunction(
      undefined,
      undefined,
      [
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          this.factory.createObjectBindingPattern([
            this.factory.createBindingElement(
              undefined,
              undefined,
              this.factory.createIdentifier("$size"),
              undefined
            ),
          ]),
          undefined,
          undefined,
          undefined
        ),
      ],
      undefined,
      undefined,
      this.factory.createElementAccessExpression(
        this.factory.createIdentifier("paddingBySize"),
        this.factory.createIdentifier("$size")
      )
    );

    const templateSpan1 = this.factory.createTemplateSpan(
      arrowFunctionCorrect,
      this.factory.createTemplateMiddle(
        ";\n\n&:active {\n  background: var(--Primary-700, #00abb6);\n}\n\n&:disabled {\n  background: var(--Primary-300, #b0ebec);\n}\n\n&:hover {\n  cursor: pointer;\n  background: var(--Primary-500, #47cfd6);\n}\n"
      )
    );

    const templateExpression = this.factory.createTemplateExpression(
      templateHead,
      [templateSpan1]
    );

    // 5. styled.button<{ $size: Size }>`...` 호출
    const styledCall = this.factory.createCallExpression(
      styledButton,
      genericType,
      [templateExpression]
    );

    // 6. const PrimaryButton = ... 변수 선언
    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier("PrimaryButton"),
            undefined,
            undefined,
            styledCall
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
      "display: inline-flex;\nalign-items: center;\ngap: 4px;\njustify-content: center;\n"
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
