import ts, { NodeFactory } from "typescript";
import CreateJsxTree from "@compiler/core/react-generator/generate-component/jsx-tree/CreateJsxTree";
import { FinalAstTree } from "@compiler";
import CreateStyledComponent from "@compiler/core/react-generator/generate-component/styeld/CreateStyledComponent";

class GenerateComponent {
  private factory: NodeFactory;
  private astTree: FinalAstTree;
  private CreateStyledComponent: CreateStyledComponent;

  constructor(factory: NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;

    this.CreateStyledComponent = new CreateStyledComponent(factory, astTree);
  }

  public createStyledComponent() {
    return this.CreateStyledComponent.createStyledComponentExample();
  }
  /**
   * 컴포넌트 함수 생성
   * export default function ComponentName(props: Props) { ... }
   */
  public createComponentFunction(
    componentName: string
  ): ts.FunctionDeclaration {
    const jsxTree = new CreateJsxTree(this.astTree).jsxTree;

    // JsxExpression을 return 문에서 사용할 수 있도록 변환
    let returnExpression: ts.Expression;
    if (ts.isJsxExpression(jsxTree)) {
      // JsxExpression의 expression을 그대로 사용
      if (jsxTree.expression) {
        returnExpression = jsxTree.expression;
      } else {
        // expression이 없으면 null 반환
        returnExpression = this.factory.createNull();
      }
    } else {
      // JsxElement 또는 JsxSelfClosingElement는 그대로 사용
      returnExpression = jsxTree;
    }

    return this.factory.createFunctionDeclaration(
      [
        this.factory.createModifier(ts.SyntaxKind.ExportKeyword),
        this.factory.createModifier(ts.SyntaxKind.DefaultKeyword),
      ],
      undefined,
      componentName,
      undefined,
      [
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          this.factory.createIdentifier("props"),
          undefined,
          this.factory.createTypeReferenceNode(
            this.factory.createIdentifier(`${componentName}Props`),
            undefined
          ),
          undefined
        ),
      ],
      undefined,
      this.factory.createBlock(
        [
          // return <JSX>;
          this.factory.createReturnStatement(returnExpression),
        ],
        true
      )
    );
  }
}

export default GenerateComponent;
