import ts, { NodeFactory } from "typescript";

/**
 * 외부 컴포넌트 정보
 */
interface ExternalComponentInfo {
  componentName: string;
  componentSetId: string;
}

class GenerateImports {
  private factory: NodeFactory;
  private externalComponents: ExternalComponentInfo[];

  constructor(
    factory: NodeFactory,
    externalComponents: ExternalComponentInfo[] = []
  ) {
    this.factory = factory;
    this.externalComponents = externalComponents;
  }

  public createImports(): ts.ImportDeclaration[] {
    const imports: ts.ImportDeclaration[] = [];

    // React import: import React from "react";
    imports.push(this._createReactImport());

    // emotion css import: import { css, cx } from "@emotion/css";
    imports.push(this._createEmotionCssImport());

    // 외부 컴포넌트는 같은 파일에 생성되므로 import 불필요

    return imports;
  }

  /**
   * 외부 컴포넌트 import 생성
   * import { SelectButton } from "./SelectButton";
   */
  private _createExternalComponentImport(
    componentName: string
  ): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        undefined,
        this.factory.createNamedImports([
          this.factory.createImportSpecifier(
            false,
            undefined,
            this.factory.createIdentifier(componentName)
          ),
        ])
      ),
      this.factory.createStringLiteral(`./${componentName}`)
    );
  }

  private _createReactImport(): ts.ImportDeclaration {
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

  private _createEmotionStyledImport() {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        this.factory.createIdentifier("styled"),
        undefined
      ),
      this.factory.createStringLiteral("@emotion/styled")
    );
  }

  private _createEmotionCssImport(): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        undefined,
        this.factory.createNamedImports([
          this.factory.createImportSpecifier(
            false,
            undefined,
            this.factory.createIdentifier("css")
          ),
        ])
      ),
      this.factory.createStringLiteral("@emotion/react")
    );
  }
}

export default GenerateImports;
