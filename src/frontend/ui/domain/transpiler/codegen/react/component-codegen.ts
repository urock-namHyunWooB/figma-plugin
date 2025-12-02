import ts from "typescript";
import { generatePropsInterface, createPropsParameter } from "./props-codegen";
import type { PropIR, UnifiedNode, VariantStyleIR } from "../../types";
import {
  createReactImport,
  createUseStateImport,
  createEmotionCssImport,
} from "./react/imports";
import { createVariantStyleConstants } from "./style/variant-style-generator";
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
  public generateComponentTSXWithTS(ast: UnifiedNode, props: PropIR[]): string {
    const sourceFile = this.buildSourceFile(ast, props);
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
  private buildSourceFile(ast: UnifiedNode, props: PropIR[]): ts.SourceFile {
    const componentName = ast.name || "GeneratedComponent";
    const reactImport = createReactImport(this.factory);
    const statements: ts.Statement[] = [reactImport];

    const emotionCssImport = createEmotionCssImport(this.factory);
    statements.push(emotionCssImport);

    const useStateImport = createUseStateImport(this.factory);
    statements.push(useStateImport);

    const propsInterface = generatePropsInterface(props, componentName);
    statements.push(propsInterface);

    // Variant style 상수 생성 (baseStyle, dimension별 스타일 맵)

    const variantStyleConstants = createVariantStyleConstants(
      this.factory,
      props,
      variantStyleMap
    );
    statements.push(...variantStyleConstants);

    // 자식 요소들의 스타일 상수 생성
    const elementStyleConstants = createElementStyleConstants(
      this.factory,
      ast.root
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
    ast: AstTree,
    variantStyleMap?: Map<string, VariantStyleIR>
  ): ts.FunctionDeclaration {
    const componentName = ast.name || "GeneratedComponent";
    const statements: ts.Statement[] = [];

    // State hook 선언들 추가
    // bindings에서 state id를 수집하고, 해당 id로 state 정보를 찾아서 hook 생성
    const stateIds = new Set<string>();
    traverseAST(ast.root, (path) => {
      path.node.bindings.forEach((binding) => {
        // state id는 "state-xxx" 형태
        if (binding.id.startsWith("state-")) {
          stateIds.add(binding.id);
        }
      });
    });

    // state 정보가 있으면 해당 state들에 대해 hook 생성
    if (ast.states && ast.states.length > 0) {
      const usedStates = ast.states.filter((state) => stateIds.has(state.id));
      // 중복 제거 (같은 state가 여러 노드에서 사용될 수 있음)
      const uniqueStates = Array.from(
        new Map(usedStates.map((state) => [state.id, state])).values()
      );

      for (const state of uniqueStates) {
        const stateHook = createUseStateHook(
          this.factory,
          state.name,
          state.defaultValue
        );
        statements.push(stateHook);
      }
    }

    // JSX return 문
    // 루트 요소인 경우 variant style 머지 로직 적용
    const jsxRoot = convertElementToJsx(
      this.factory,
      ast.root,
      ast.props,
      variantStyleMap,
      true,
      ast.states
    );

    console.log("jsxRoot", jsxRoot);
    const returnStatement = this.factory.createReturnStatement(jsxRoot);
    statements.push(returnStatement);

    const functionBody = this.factory.createBlock(statements, true);

    // Props 파라미터 생성
    const parameters = createPropsParameter(
      this.factory,
      componentName,
      ast.props
    );

    return this.factory.createFunctionDeclaration(
      undefined, // export 키워드 제거
      undefined,
      this.factory.createIdentifier(componentName),
      undefined,
      parameters,
      undefined, // 반환 타입은 추론
      functionBody
    );
  }
}
