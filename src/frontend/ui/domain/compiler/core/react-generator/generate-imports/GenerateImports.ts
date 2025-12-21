import ts, { NodeFactory } from "typescript";

class GenerateImports {
  private factory: NodeFactory;
  constructor(factory: NodeFactory) {
    this.factory = factory;
  }

  public createImports(): ts.ImportDeclaration[] {
    const imports: ts.ImportDeclaration[] = [];

    // React import: import React from "react";
    imports.push(this._createReactImport());

    // emotion css import: import { css, cx } from "@emotion/css";
    imports.push(this._createEmotionStyledImport());

    return imports;
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
          this.factory.createImportSpecifier(
            false,
            undefined,
            this.factory.createIdentifier("cx")
          ),
        ])
      ),
      this.factory.createStringLiteral("@emotion/css")
    );
  }
}

export default GenerateImports;
