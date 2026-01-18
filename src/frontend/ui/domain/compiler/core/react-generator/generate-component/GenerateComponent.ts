import ts, { NodeFactory } from "typescript";
import CreateJsxTree from "@compiler/core/react-generator/generate-component/jsx-tree/CreateJsxTree";
import { FinalAstTree } from "@compiler";
import CreateStyledComponent from "@compiler/core/react-generator/generate-component/styeld/CreateStyledComponent";
import { ArraySlot } from "@compiler/core/ArraySlotDetector";
import { StyleStrategy } from "@compiler/core/react-generator/style-strategy";

/**
 * GenerateComponent 옵션
 */
export interface GenerateComponentOptions {
  /** 스타일 전략 */
  styleStrategy?: StyleStrategy;
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
}

class GenerateComponent {
  private factory: NodeFactory;
  private astTree: FinalAstTree;
  private arraySlots: ArraySlot[];
  private styleStrategy?: StyleStrategy;
  private debug: boolean;

  constructor(
    factory: NodeFactory,
    astTree: FinalAstTree,
    arraySlots: ArraySlot[] = [],
    options?: GenerateComponentOptions
  ) {
    this.factory = factory;
    this.astTree = astTree;
    this.arraySlots = arraySlots;
    this.styleStrategy = options?.styleStrategy;
    this.debug = options?.debug ?? false;
  }
  /**
   * 컴포넌트 함수 생성
   * export default function ComponentName(props: Props) { ... }
   */
  public createComponentFunction(
    componentName: string
  ): ts.FunctionDeclaration {
    const jsxTree = new CreateJsxTree(this.astTree, this.arraySlots, {
      styleStrategy: this.styleStrategy,
      debug: this.debug,
    }).jsxTree;

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

    // Props 구조 분해 및 배열 슬롯 안전화 문장 생성
    const { destructuring, arraySlotSafeStatements } =
      this._createPropsDestructuringWithArraySafety();

    // 함수 본문 구성
    const bodyStatements: ts.Statement[] = [
      destructuring,
      ...arraySlotSafeStatements,
      this.factory.createReturnStatement(returnExpression),
    ];

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
      this.factory.createBlock(bodyStatements, true)
    );
  }

  /**
   * Props 구조 분해 선언 생성 (배열 슬롯 안전화 포함)
   *
   * 배열 슬롯의 경우, 부모에서 문자열 등 비-배열 값이 전달될 수 있으므로:
   * 1. 구조 분해: const { options: _rawOptions, ... } = props;
   * 2. 안전화: const options = Array.isArray(_rawOptions) ? _rawOptions : [];
   */
  private _createPropsDestructuringWithArraySafety(): {
    destructuring: ts.VariableStatement;
    arraySlotSafeStatements: ts.VariableStatement[];
  } {
    const props = this.astTree.props || {};

    // 배열 슬롯 이름 수집 (중복 제거)
    const arraySlotNames = new Set(
      this.arraySlots.map((slot) => slot.slotName)
    );

    const bindingElements: ts.BindingElement[] = [];
    const arraySlotSafeStatements: ts.VariableStatement[] = [];

    for (const [propName, propDef] of Object.entries(props)) {
      const prop = propDef as any;

      // 배열 슬롯과 연관된 prop은 건너뛰기
      if (arraySlotNames.has(propName.toLowerCase())) {
        continue;
      }

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

    // 배열 슬롯 props: 임시 변수로 추출 후 안전화
    for (const slotName of arraySlotNames) {
      const rawVarName = `_raw${slotName.charAt(0).toUpperCase()}${slotName.slice(1)}`;

      // 구조 분해: slotName: _rawSlotName
      const bindingElement = this.factory.createBindingElement(
        undefined,
        this.factory.createIdentifier(slotName), // propertyName
        this.factory.createIdentifier(rawVarName), // name (임시 변수)
        undefined
      );
      bindingElements.push(bindingElement);

      // 안전화 문장: const slotName = Array.isArray(_rawSlotName) ? _rawSlotName : [];
      const safeStatement = this.factory.createVariableStatement(
        undefined,
        this.factory.createVariableDeclarationList(
          [
            this.factory.createVariableDeclaration(
              this.factory.createIdentifier(slotName),
              undefined,
              undefined,
              this.factory.createConditionalExpression(
                // Array.isArray(_rawSlotName)
                this.factory.createCallExpression(
                  this.factory.createPropertyAccessExpression(
                    this.factory.createIdentifier("Array"),
                    this.factory.createIdentifier("isArray")
                  ),
                  undefined,
                  [this.factory.createIdentifier(rawVarName)]
                ),
                this.factory.createToken(ts.SyntaxKind.QuestionToken),
                // ? _rawSlotName
                this.factory.createIdentifier(rawVarName),
                this.factory.createToken(ts.SyntaxKind.ColonToken),
                // : []
                this.factory.createArrayLiteralExpression([])
              )
            ),
          ],
          ts.NodeFlags.Const
        )
      );
      arraySlotSafeStatements.push(safeStatement);
    }

    // overrideableProps 추가 (dependency 컴포넌트의 오버라이드 가능한 prop)
    if (this.astTree.overrideableProps) {
      for (const [propName] of Object.entries(this.astTree.overrideableProps)) {
        const bindingElement = this.factory.createBindingElement(
          undefined,
          undefined,
          this.factory.createIdentifier(propName),
          undefined
        );
        bindingElements.push(bindingElement);
      }
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
    const destructuring = this.factory.createVariableStatement(
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

    return { destructuring, arraySlotSafeStatements };
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
