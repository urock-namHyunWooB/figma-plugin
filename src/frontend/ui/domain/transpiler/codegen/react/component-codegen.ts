import ts from "typescript";
import { generatePropsInterface } from "./props-codegen";
import type { PropIR, UnifiedNode } from "../../types";
import {
  createReactImport,
  createUseStateImport,
  createEmotionCssImport,
  createEmotionStyledImport,
} from "./react/imports";
import VariantGenerator from "./style/variant-style-generator";
import { createElementStyleConstants } from "./style/element-style-generator";
import { VariantStyleMap } from "@frontend/ui/domain/transpiler/types/variant";

/**
 * ComponentAST를 TypeScript/TSX 코드로 변환하는 구현체
 */
export class CodeGenerator {
  private readonly factory = ts.factory;

  /**
   * ComponentAST를 TSX 코드 문자열로 변환
   *
   * 변환 과정:
   * 1. AST를 TypeScript SourceFile로 변환
   * 2. SourceFile을 코드 문자열로 출력
   */
  public generateComponentTSXWithTS(
    ast: UnifiedNode,
    props: PropIR[],
    variantStyleMap: VariantStyleMap
  ): string {
    const sourceFile = this.buildSourceFile(ast, props, variantStyleMap);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printFile(sourceFile);
  }

  /**
   * ComponentAST를 TypeScript SourceFile로 변환
   *
   * 생성 내용:
   * - React import 문
   * - useState import 문 (state가 있는 경우)
   * - Props 인터페이스
   * - 컴포넌트 함수 선언 (function ComponentName(props: Props) { ... return <JSX>; })
   * - export default 문
   */
  private buildSourceFile(
    ast: UnifiedNode,
    props: PropIR[],
    variantStyleMap: VariantStyleMap
  ): ts.SourceFile {
    // const componentName = ast.name || "GeneratedComponent";
    const componentName = "Button";

    const statements: ts.Statement[] = [];

    statements.push(
      createReactImport(this.factory),
      createEmotionCssImport(this.factory),
      createEmotionStyledImport(this.factory)
    );

    statements.push(createUseStateImport(this.factory));

    statements.push(generatePropsInterface(props, componentName));

    statements.push(
      ...new VariantGenerator(ast, variantStyleMap)
        .createVariantType()
        .createGetVariantStyleFunction()
        .createStyledComponent()
        .getResults()
    );

    // 자식 요소들의 스타일 상수 생성
    statements.push(...createElementStyleConstants(this.factory, ast));

    statements.push(this.createComponentFunction(ast, props, variantStyleMap));

    statements.push(
      this.factory.createExportAssignment(
        undefined,
        false,
        this.factory.createIdentifier(componentName)
      )
    );

    const sourceFile = this.factory.createSourceFile(
      statements,
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );

    // TSX 파일임을 명시
    (sourceFile as any).fileName = `${componentName}.tsx`;

    return sourceFile;
  }

  /**
   * 컴포넌트 함수 생성
   * export const ComponentName: React.FC<Props> = ({ ...props }) => { return <JSX>; };
   */
  private createComponentFunction(
    _ast: UnifiedNode,
    props: PropIR[],
    _variantStyleMap: VariantStyleMap
  ): ts.VariableStatement {
    const componentName = "Button";
    const propsTypeName = `${componentName}Props`;

    // 1. Props destructuring elements 생성: { size = "Large", leftIcon, ...props }
    const bindingElements: ts.BindingElement[] = [];

    // Variant props와 Component(Slot) props 추가
    for (const prop of props) {
      let initializer: ts.Expression | undefined;

      // default value 설정
      if (prop.defaultValue !== undefined && prop.type !== "COMPONENT") {
        if (typeof prop.defaultValue === "string") {
          initializer = this.factory.createStringLiteral(prop.defaultValue);
        } else if (typeof prop.defaultValue === "boolean") {
          initializer = prop.defaultValue
            ? this.factory.createTrue()
            : this.factory.createFalse();
        } else if (typeof prop.defaultValue === "number") {
          initializer = this.factory.createNumericLiteral(prop.defaultValue);
        }
      }

      bindingElements.push(
        this.factory.createBindingElement(
          undefined,
          undefined,
          this.factory.createIdentifier(prop.normalizedName),
          initializer
        )
      );
    }

    // children 추가
    bindingElements.push(
      this.factory.createBindingElement(
        undefined,
        undefined,
        this.factory.createIdentifier("children"),
        undefined
      )
    );

    // ...props (rest) 추가
    bindingElements.push(
      this.factory.createBindingElement(
        this.factory.createToken(ts.SyntaxKind.DotDotDotToken),
        undefined,
        this.factory.createIdentifier("props"),
        undefined
      )
    );

    const bindingPattern =
      this.factory.createObjectBindingPattern(bindingElements);

    // 2. Arrow function body 생성
    const bodyStatements: ts.Statement[] = [];

    // State variant가 있으면 finalState 변수 생성
    // const finalState = props.disabled ? "Disabled" : buttonState;
    const stateVariantProp = props.find(
      (p) =>
        p.originalName.toLowerCase().includes("state") && p.type === "VARIANT"
    );

    if (stateVariantProp) {
      const finalStateDecl = this.factory.createVariableStatement(
        undefined,
        this.factory.createVariableDeclarationList(
          [
            this.factory.createVariableDeclaration(
              this.factory.createIdentifier("finalState"),
              undefined,
              undefined,
              this.factory.createConditionalExpression(
                this.factory.createPropertyAccessExpression(
                  this.factory.createIdentifier("props"),
                  this.factory.createIdentifier("disabled")
                ),
                this.factory.createToken(ts.SyntaxKind.QuestionToken),
                this.factory.createStringLiteral("Disabled"),
                this.factory.createToken(ts.SyntaxKind.ColonToken),
                this.factory.createIdentifier(stateVariantProp.normalizedName)
              )
            ),
          ],
          ts.NodeFlags.Const
        )
      );
      bodyStatements.push(finalStateDecl);
    }

    // 3. JSX 생성: <StyledButton sizeVariant={size} stateVariant={finalState} {...props}>
    const jsxAttributes: ts.JsxAttributeLike[] = [];

    // Variant props를 xxxVariant 형태로 추가
    for (const prop of props) {
      if (prop.type === "VARIANT") {
        const isStateVariant = prop.originalName
          .toLowerCase()
          .includes("state");
        const attrName = `${prop.normalizedName}Variant`;
        const attrValue =
          isStateVariant && stateVariantProp
            ? this.factory.createIdentifier("finalState")
            : this.factory.createIdentifier(prop.normalizedName);

        jsxAttributes.push(
          this.factory.createJsxAttribute(
            this.factory.createIdentifier(attrName),
            this.factory.createJsxExpression(undefined, attrValue)
          )
        );
      }
    }

    // disabled 속성 추가 (State variant가 있는 경우)
    if (stateVariantProp) {
      jsxAttributes.push(
        this.factory.createJsxAttribute(
          this.factory.createIdentifier("disabled"),
          this.factory.createJsxExpression(
            undefined,
            this.factory.createBinaryExpression(
              this.factory.createIdentifier("finalState"),
              this.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
              this.factory.createStringLiteral("Disabled")
            )
          )
        )
      );
    }

    // {...props} spread 추가
    jsxAttributes.push(
      this.factory.createJsxSpreadAttribute(
        this.factory.createIdentifier("props")
      )
    );

    // JSX Children 생성
    const jsxChildren: ts.JsxChild[] = [];

    // Slot props (COMPONENT 타입) 조건부 렌더링
    for (const prop of props) {
      if (prop.type === "COMPONENT") {
        // {leftIcon && leftIcon}
        jsxChildren.push(
          this.factory.createJsxExpression(
            undefined,
            this.factory.createBinaryExpression(
              this.factory.createIdentifier(prop.normalizedName),
              this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
              this.factory.createIdentifier(prop.normalizedName)
            )
          )
        );
      }
    }

    // children 추가: <span>{children}</span>
    jsxChildren.push(
      this.factory.createJsxElement(
        this.factory.createJsxOpeningElement(
          this.factory.createIdentifier("span"),
          undefined,
          this.factory.createJsxAttributes([])
        ),
        [
          this.factory.createJsxExpression(
            undefined,
            this.factory.createIdentifier("children")
          ),
        ],
        this.factory.createJsxClosingElement(
          this.factory.createIdentifier("span")
        )
      )
    );

    // StyledButton JSX Element
    const styledComponentName = "StyledComponent"; // VariantGenerator에서 생성한 이름과 일치해야 함
    const jsxElement = this.factory.createJsxElement(
      this.factory.createJsxOpeningElement(
        this.factory.createIdentifier(styledComponentName),
        undefined,
        this.factory.createJsxAttributes(jsxAttributes)
      ),
      jsxChildren,
      this.factory.createJsxClosingElement(
        this.factory.createIdentifier(styledComponentName)
      )
    );

    // Return statement
    const returnStatement = this.factory.createReturnStatement(
      this.factory.createParenthesizedExpression(jsxElement)
    );
    bodyStatements.push(returnStatement);

    // 4. Arrow function 생성
    const arrowFunction = this.factory.createArrowFunction(
      undefined,
      undefined,
      [
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          bindingPattern,
          undefined,
          this.factory.createTypeReferenceNode(
            this.factory.createIdentifier(propsTypeName),
            undefined
          ),
          undefined
        ),
      ],
      undefined,
      this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      this.factory.createBlock(bodyStatements, true)
    );

    // 5. 타입 어노테이션: React.FC<Props>
    const reactFCType = this.factory.createTypeReferenceNode(
      this.factory.createQualifiedName(
        this.factory.createIdentifier("React"),
        this.factory.createIdentifier("FC")
      ),
      [
        this.factory.createTypeReferenceNode(
          this.factory.createIdentifier(propsTypeName),
          undefined
        ),
      ]
    );

    // 6. export const ComponentName: React.FC<Props> = (...) => { ... };
    return this.factory.createVariableStatement(
      [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier(componentName),
            undefined,
            reactFCType,
            arrowFunction
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  private _testDebug(statements: ts.Statement[]) {
    const sourceFile = this.factory.createSourceFile(
      statements,
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

    console.log(printer.printFile(sourceFile));
  }
}
