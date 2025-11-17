import ts from "typescript";
import type {
  ComponentAST,
  ElementASTNode,
  ICodeGenerator,
  BindingModel,
} from "../../types";
import { generatePropsInterface, createPropsParameter } from "./props-codegen";
import type { PropIR, VariantStyleIR } from "../../types/props";
import { createReactImport, createUseStateImport } from "./react/imports";
import { createUseStateHook } from "./react/hooks";
import { createVariantStyleConstants } from "./style/variant-style-generator";
import { convertElementToJsx } from "./jsx/jsx-generator";

/**
 * ComponentAST를 TypeScript/TSX 코드로 변환하는 구현체
 */
export class CodeGenerator implements ICodeGenerator {
  private readonly factory = ts.factory;

  /**
   * ComponentAST를 TSX 코드 문자열로 변환
   *
   * 변환 과정:
   * 1. AST를 TypeScript SourceFile로 변환
   * 2. SourceFile을 코드 문자열로 출력
   */
  public generateComponentTSXWithTS(
    ast: ComponentAST,
    propsIR: PropIR[],
    variantStyleMap: Map<string, VariantStyleIR>,
    bindingModel?: BindingModel
  ): string {
    const sourceFile = this.buildSourceFile(
      ast,
      propsIR,
      variantStyleMap,
      bindingModel
    );
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
   * - 컴포넌트 함수 선언 (export function ComponentName(props: Props) { ... return <JSX>; })
   */
  private buildSourceFile(
    ast: ComponentAST,
    propsIR: PropIR[],
    variantStyleMap: Map<string, VariantStyleIR>,
    bindingModel?: BindingModel
  ): ts.SourceFile {
    const componentName = ast.name || "GeneratedComponent";
    const reactImport = createReactImport(this.factory);
    const statements: ts.Statement[] = [reactImport];

    // State가 있으면 useState import 추가
    if (bindingModel?.state && bindingModel.state.length > 0) {
      const useStateImport = createUseStateImport(this.factory);
      statements.push(useStateImport);
    }

    const propsInterface = generatePropsInterface(propsIR, componentName);
    statements.push(propsInterface);

    // Variant style 상수 생성 (baseStyle, dimension별 스타일 맵)
    const variantStyleConstants = createVariantStyleConstants(
      this.factory,
      propsIR,
      variantStyleMap
    );
    statements.push(...variantStyleConstants);

    const componentFunction = this.createComponentFunction(
      componentName,
      ast.root,
      propsIR,
      variantStyleMap,
      bindingModel
    );
    statements.push(componentFunction);

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
   * 컴포넌트 함수 선언 생성: export function ComponentName(props: Props) { ... return <JSX>; }
   */
  private createComponentFunction(
    componentName: string,
    rootElement: ElementASTNode,
    propsIR: PropIR[],
    variantStyleMap: Map<string, VariantStyleIR>,
    bindingModel?: BindingModel
  ): ts.FunctionDeclaration {
    const statements: ts.Statement[] = [];

    // State hook 선언들 추가
    if (bindingModel?.state && bindingModel.state.length > 0) {
      for (const stateBinding of bindingModel.state) {
        const stateHook = createUseStateHook(
          this.factory,
          stateBinding.name,
          stateBinding.defaultValue
        );
        statements.push(stateHook);
      }
    }

    // JSX return 문
    // 루트 요소인 경우 variant style 머지 로직 적용
    const jsxRoot = convertElementToJsx(
      this.factory,
      rootElement,
      propsIR,
      variantStyleMap,
      true
    );
    const returnStatement = this.factory.createReturnStatement(jsxRoot);
    statements.push(returnStatement);

    const functionBody = this.factory.createBlock(statements, true);

    // Props 파라미터 생성
    const parameters = createPropsParameter(
      this.factory,
      componentName,
      propsIR
    );

    return this.factory.createFunctionDeclaration(
      [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      this.factory.createIdentifier(componentName),
      undefined,
      parameters,
      undefined, // 반환 타입은 추론
      functionBody
    );
  }
}
