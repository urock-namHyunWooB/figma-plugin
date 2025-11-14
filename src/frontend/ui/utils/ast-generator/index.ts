/**
 * TypeScript Compiler API를 사용한 AST 기반 코드 생성
 *
 * DSL (JSON) → TypeScript AST → 코드 문자열
 */

import * as ts from "typescript";
import type { ComponentDSL } from "./types";
import { createUseStateImport, createUseStateHook } from "./state";
import { createPropsInterface } from "./props";
import { createStylesObject } from "./styles";
import { createReturnStatement } from "./jsx";
import { createFunctionParameters } from "./helpers";

/**
 * DSL을 TypeScript AST로 변환하는 클래스
 */
export class ASTGenerator {
  private factory: ts.NodeFactory;
  private sourceFile: ts.SourceFile;
  private elementIdToStyleKey: Map<string, string> = new Map();

  constructor() {
    this.factory = ts.factory;
    // 가상의 소스 파일 생성 (AST 생성에 필요)
    this.sourceFile = ts.createSourceFile(
      "component.tsx",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX,
    );
  }

  /**
   * DSL을 React 컴포넌트 AST로 변환
   */
  generateComponentAST(dsl: ComponentDSL): ts.SourceFile {
    // 매핑 초기화
    this.elementIdToStyleKey.clear();

    const statements: ts.Statement[] = [];

    // 1. Import 문 생성
    if (dsl.internalStateDefinition && dsl.internalStateDefinition.length > 0) {
      statements.push(createUseStateImport());
    }

    // 2. Props Interface 생성
    if (dsl.propsDefinition && dsl.propsDefinition.length > 0) {
      statements.push(
        createPropsInterface(dsl.metadata.name, dsl.propsDefinition),
      );
    }

    // 3. Styles 객체 생성
    if (dsl.layoutTree) {
      const stylesStatement = createStylesObject(
        dsl.layoutTree,
        this.elementIdToStyleKey,
      );
      if (stylesStatement) {
        statements.push(stylesStatement);
      }
    }

    // 4. 함수 선언 생성
    statements.push(this.createComponentFunction(dsl));

    // 5. Export 문 생성
    statements.push(this.createExportStatement(dsl.metadata.name));

    // SourceFile 생성
    return ts.factory.updateSourceFile(this.sourceFile, statements);
  }

  /**
   * 컴포넌트 함수 생성
   */
  private createComponentFunction(dsl: ComponentDSL): ts.FunctionDeclaration {
    const statements: ts.Statement[] = [];

    // Internal State 생성
    if (dsl.internalStateDefinition) {
      dsl.internalStateDefinition.forEach((state) => {
        statements.push(createUseStateHook(state.name, state.initialValue));
      });
    }

    // Return 문 생성
    statements.push(createReturnStatement(dsl, this.elementIdToStyleKey));

    // Props 파라미터 생성
    const parameters = createFunctionParameters(
      dsl.metadata.name,
      dsl.propsDefinition,
    );

    return ts.factory.createFunctionDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      dsl.metadata.name,
      undefined,
      parameters,
      undefined,
      ts.factory.createBlock(statements, true),
    );
  }

  /**
   * Export 문 생성
   */
  private createExportStatement(componentName: string): ts.ExportAssignment {
    return ts.factory.createExportAssignment(
      undefined,
      false,
      ts.factory.createIdentifier(componentName),
    );
  }

  /**
   * AST를 코드 문자열로 변환
   */
  generateCode(ast: ts.SourceFile): string {
    const printer = ts.createPrinter({
      removeComments: false,
      newLine: ts.NewLineKind.LineFeed,
    });

    return printer.printFile(ast);
  }

  /**
   * DSL을 직접 코드로 변환 (편의 메서드)
   */
  generateCodeFromDSL(dsl: ComponentDSL): string {
    const ast = this.generateComponentAST(dsl);
    return this.generateCode(ast);
  }
}

// 타입 재export
export type { ComponentDSL } from "./types";
