import ts, { NodeFactory } from "typescript";
import CreateJsxTree from "@compiler/core/react-generator/generate-component/jsx-tree/CreateJsxTree";
import { FinalAstTree } from "@compiler";
import CreateStyledComponent from "@compiler/core/react-generator/generate-component/styeld/CreateStyledComponent";
import { ArraySlot } from "@compiler/core/ArraySlotDetector";
import { StyleStrategy } from "@compiler/core/react-generator/style-strategy";

class GenerateComponent {
  private factory: NodeFactory;
  private astTree: FinalAstTree;
  private arraySlots: ArraySlot[];
  private styleStrategy?: StyleStrategy;

  constructor(
    factory: NodeFactory,
    astTree: FinalAstTree,
    arraySlots: ArraySlot[] = [],
    styleStrategy?: StyleStrategy
  ) {
    this.factory = factory;
    this.astTree = astTree;
    this.arraySlots = arraySlots;
    this.styleStrategy = styleStrategy;
  }
  /**
   * 컴포넌트 함수 생성
   * export default function ComponentName(props: Props) { ... }
   */
  public createComponentFunction(
    componentName: string
  ): ts.FunctionDeclaration {
    const jsxTree = new CreateJsxTree(
      this.astTree,
      this.arraySlots,
      this.styleStrategy
    ).jsxTree;

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

    // Props 구조 분해 생성
    const destructuringStatement = this._createPropsDestructuring();

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
          // const { size = "Large", ...restProps } = props;
          destructuringStatement,
          // return <JSX>;
          this.factory.createReturnStatement(returnExpression),
        ],
        true
      )
    );
  }

  /**
   * Props 구조 분해 선언 생성
   * const { size = "Large", leftIcon, rightIcon, text, ...restProps } = props;
   * props가 비어있어도 restProps는 항상 생성
   */
  private _createPropsDestructuring(): ts.VariableStatement {
    const props = this.astTree.props || {};

    // 배열 슬롯 이름 수집 (중복 제거)
    const arraySlotNames = new Set(
      this.arraySlots.map((slot) => slot.slotName)
    );

    const bindingElements: ts.BindingElement[] = [];
    const propNames: string[] = [];

    for (const [propName, propDef] of Object.entries(props)) {
      const prop = propDef as any;

      // 배열 슬롯과 연관된 prop은 건너뛰기
      if (arraySlotNames.has(propName.toLowerCase())) {
        continue;
      }

      propNames.push(propName);

      // 기본값이 있는 경우
      if (prop.defaultValue !== undefined) {
        const defaultValue = this._valueToExpression(prop.defaultValue);
        const bindingElement = this.factory.createBindingElement(
          undefined,
          undefined,
          this.factory.createIdentifier(propName),
          defaultValue
        );
        bindingElements.push(bindingElement);
      } else {
        // 기본값이 없는 경우
        const bindingElement = this.factory.createBindingElement(
          undefined,
          undefined,
          this.factory.createIdentifier(propName),
          undefined
        );
        bindingElements.push(bindingElement);
      }
    }

    // 배열 슬롯 props 추가 (기본값: 빈 배열)
    for (const slotName of arraySlotNames) {
      propNames.push(slotName);
      const bindingElement = this.factory.createBindingElement(
        undefined,
        undefined,
        this.factory.createIdentifier(slotName),
        this.factory.createArrayLiteralExpression([]) // 기본값: []
      );
      bindingElements.push(bindingElement);
    }

    // children prop 추가 (의존 컴포넌트가 SVG 등을 children으로 받을 수 있도록)
    const childrenBindingElement = this.factory.createBindingElement(
      undefined,
      undefined,
      this.factory.createIdentifier("children"),
      undefined
    );
    bindingElements.push(childrenBindingElement);

    // 나머지 props를 위한 rest element
    const restElement = this.factory.createBindingElement(
      this.factory.createToken(ts.SyntaxKind.DotDotDotToken),
      undefined,
      this.factory.createIdentifier("restProps"),
      undefined
    );
    bindingElements.push(restElement);

    // Object binding pattern 생성
    const bindingPattern =
      this.factory.createObjectBindingPattern(bindingElements);

    // const { ... } = props;
    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            bindingPattern,
            undefined,
            undefined,
            this.factory.createIdentifier("props")
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * 값을 TypeScript Expression으로 변환
   */
  private _valueToExpression(value: any): ts.Expression {
    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    if (value === null) {
      return this.factory.createNull();
    }
    // 기본값은 문자열로 변환
    return this.factory.createStringLiteral(String(value));
  }
}

export default GenerateComponent;
