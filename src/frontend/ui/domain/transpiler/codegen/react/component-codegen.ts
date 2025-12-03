import ts from "typescript";
import { generatePropsInterface, createPropsParameter } from "./props-codegen";
import type { PropIR, UnifiedNode, VariantStyleIR } from "../../types";
import {
  createReactImport,
  createUseStateImport,
  createEmotionCssImport,
  createEmotionStyledImport,
} from "./react/imports";
import VariantGenerator, {
  createVariantStyleConstants,
} from "./style/variant-style-generator";
import { createElementStyleConstants } from "./style/element-style-generator";
import { convertElementToJsx } from "./jsx/jsx-generator";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";
import { traverseAST } from "@frontend/ui/domain/transpiler/utils/ast-tree-utils";
import { createUseStateHook } from "./react/hooks";
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

    this._testDebug(statements);

    // 자식 요소들의 스타일 상수 생성
    const elementStyleConstants = createElementStyleConstants(
      this.factory,
      ast
    );
    statements.push(...elementStyleConstants);

    const componentFunction = this.createComponentFunction(
      ast,
      variantStyleMap
    );
    statements.push(componentFunction);

    // export default 문 추가
    const exportDefault = this.factory.createExportAssignment(
      undefined,
      false,
      this.factory.createIdentifier(componentName)
    );
    statements.push(exportDefault);

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
   * 컴포넌트 함수 및 JSX 생성: function ComponentName(props: Props) { ... return <JSX>; }
   */
  private createComponentFunction(
    ast: UnifiedNode,
    variantStyleMap: VariantStyleMap
  ): ts.FunctionDeclaration {
    const componentName = ast.name || "GeneratedComponent";
    const statements: ts.Statement[] = [];
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
