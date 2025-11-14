import ts from "typescript";
import type { ComponentAST, ElementASTNode } from "../ast";
import type { ICodeGenerator } from "../interfaces/ICodeGenerator";

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
  public generateComponentTSXWithTS(ast: ComponentAST): string {
    const sourceFile = this.buildSourceFile(ast);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printFile(sourceFile);
  }

  /**
   * ComponentAST를 TypeScript SourceFile로 변환
   *
   * 생성 내용:
   * - React import 문
   * - 컴포넌트 함수 선언 (export function ComponentName() { return <JSX>; })
   */
  private buildSourceFile(ast: ComponentAST): ts.SourceFile {
    const componentName = ast.name || "GeneratedComponent";

    const reactImport = this.createReactImport();
    const componentFunction = this.createComponentFunction(
      componentName,
      ast.root
    );
    const statements = [reactImport, componentFunction];

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
   * React import 문 생성: import React from "react";
   */
  private createReactImport(): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        this.factory.createIdentifier("React"),
        undefined
      ),
      this.factory.createStringLiteral("react")
    );
  }

  /**
   * 컴포넌트 함수 선언 생성: export function ComponentName() { return <JSX>; }
   */
  private createComponentFunction(
    componentName: string,
    rootElement: ElementASTNode
  ): ts.FunctionDeclaration {
    const jsxRoot = this.convertElementToJsx(rootElement);
    const returnStatement = this.factory.createReturnStatement(jsxRoot);
    const functionBody = this.factory.createBlock([returnStatement], true);

    return this.factory.createFunctionDeclaration(
      [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      this.factory.createIdentifier(componentName),
      undefined,
      [], // props 파라미터는 나중에 추가 가능
      undefined, // 반환 타입은 추론
      functionBody
    );
  }

  /**
   * ElementASTNode를 JSX 요소로 변환
   *
   * 변환 규칙:
   * - 자식과 텍스트가 모두 없으면 self-closing 태그
   * - 그 외에는 opening/closing 태그로 변환
   */
  private convertElementToJsx(
    node: ElementASTNode
  ): ts.JsxElement | ts.JsxSelfClosingElement {
    const tagName = this.factory.createIdentifier(node.tag);
    const attributes = this.buildJsxAttributes(node);
    const hasContent = this.hasElementContent(node);

    if (!hasContent) {
      return this.createSelfClosingJsxElement(tagName, attributes);
    }

    return this.createJsxElementWithContent(tagName, attributes, node);
  }

  /**
   * JSX 속성 배열 생성 (현재는 style만 지원)
   */
  private buildJsxAttributes(node: ElementASTNode): ts.JsxAttributes {
    const attributes: ts.JsxAttributeLike[] = [];

    if (this.hasStyle(node) && node.props?.style) {
      const styleAttribute = this.createStyleAttribute(node.props.style);
      attributes.push(styleAttribute);
    }

    return this.factory.createJsxAttributes(attributes);
  }

  /**
   * style 속성 생성: style={...}
   */
  private createStyleAttribute(style: Record<string, any>): ts.JsxAttribute {
    const styleExpression = this.convertStyleToExpression(style);
    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("style"),
      this.factory.createJsxExpression(undefined, styleExpression)
    );
  }

  /**
   * 스타일 객체를 TypeScript 객체 리터럴 표현식으로 변환
   *
   * 변환 규칙:
   * - string → StringLiteral
   * - number → NumericLiteral
   * - 그 외 → null
   */
  private convertStyleToExpression(
    style: Record<string, any>
  ): ts.ObjectLiteralExpression {
    const properties = Object.entries(style).map(([key, value]) =>
      this.createStyleProperty(key, value)
    );

    return this.factory.createObjectLiteralExpression(properties, true);
  }

  /**
   * 스타일 속성 하나를 PropertyAssignment로 변환
   */
  private createStyleProperty(key: string, value: any): ts.PropertyAssignment {
    const valueExpression = this.convertStyleValueToExpression(value);
    return this.factory.createPropertyAssignment(
      this.factory.createIdentifier(key),
      valueExpression
    );
  }

  /**
   * 스타일 값을 TypeScript Expression으로 변환
   */
  private convertStyleValueToExpression(value: any): ts.Expression {
    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    return this.factory.createNull();
  }

  /**
   * 요소에 내용(자식 또는 텍스트)이 있는지 확인
   */
  private hasElementContent(node: ElementASTNode): boolean {
    const hasChildren = node.children && node.children.length > 0;
    const hasText = !!node.textContent?.trim();
    return hasChildren || hasText;
  }

  /**
   * Self-closing JSX 요소 생성: <tag ... />
   */
  private createSelfClosingJsxElement(
    tagName: ts.Identifier,
    attributes: ts.JsxAttributes
  ): ts.JsxSelfClosingElement {
    return this.factory.createJsxSelfClosingElement(
      tagName,
      undefined,
      attributes
    );
  }

  /**
   * 내용이 있는 JSX 요소 생성: <tag ...>...</tag>
   */
  private createJsxElementWithContent(
    tagName: ts.Identifier,
    attributes: ts.JsxAttributes,
    node: ElementASTNode
  ): ts.JsxElement {
    const opening = this.factory.createJsxOpeningElement(
      tagName,
      undefined,
      attributes
    );
    const closing = this.factory.createJsxClosingElement(tagName);
    const children = this.buildJsxChildren(node);

    return this.factory.createJsxElement(opening, children, closing);
  }

  /**
   * JSX 자식 요소 배열 생성 (텍스트 + 자식 요소들)
   */
  private buildJsxChildren(node: ElementASTNode): ts.JsxChild[] {
    const children: ts.JsxChild[] = [];

    if (node.textContent?.trim()) {
      children.push(this.factory.createJsxText(node.textContent));
    }

    if (node.children && node.children.length > 0) {
      const childElements = node.children.map((child) =>
        this.convertElementToJsx(child)
      );
      children.push(...childElements);
    }

    return children;
  }

  /**
   * 요소에 style 속성이 있는지 확인
   */
  private hasStyle(node: ElementASTNode): boolean {
    return !!(node.props?.style && Object.keys(node.props.style).length > 0);
  }
}
