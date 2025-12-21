import { FinalAstTree } from "@compiler";

import ts, { NodeFactory } from "typescript";
import * as prettier from "prettier/standalone";
import * as parserTypeScript from "prettier/plugins/typescript";
import estreePlugin from "prettier/plugins/estree";
import type { Options as PrettierOptions } from "prettier";

import GenerateImports from "./generate-imports/GenerateImports";
import GenerateStyles from "./generate-styles/GenerateStyles";
import GenerateInterface from "./generate-interface/GenerateInterface";
import GenerateComponent from "./generate-component/GenerateComponent";

interface CodeSection {
  statements: ts.Statement[];
}

class ReactGenerator {
  private astTree: FinalAstTree;
  private factory: NodeFactory;

  private GenerateImports: GenerateImports;
  private GenerateStyles: GenerateStyles;
  private GenerateInterface: GenerateInterface;
  private GenerateComponent: GenerateComponent;

  private readonly printer: ts.Printer;
  private static readonly PRETTIER_CONFIG: PrettierOptions = {
    parser: "typescript",
    plugins: [estreePlugin, parserTypeScript],
    semi: true,
    trailingComma: "es5",
    singleQuote: false,
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    arrowParens: "always",
    endOfLine: "lf",
  };

  constructor(astTree: FinalAstTree) {
    this.astTree = astTree;
    const factory = (this.factory = ts.factory);

    this.printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: true,
    });

    this.GenerateImports = new GenerateImports(factory);
    this.GenerateStyles = new GenerateStyles(factory, astTree);
    this.GenerateInterface = new GenerateInterface(factory, astTree);
    this.GenerateComponent = new GenerateComponent(factory, astTree);
  }

  /**
   * 최종 코드 문자열 생성
   */
  public async generateComponentCode(componentName: string): Promise<string> {
    const sections = this.createCodeSections(componentName);
    const unformattedCode = this.printSections(sections);
    return await this.formatCode(unformattedCode);
  }

  /**
   * 각 코드 섹션 생성
   */
  private createCodeSections(componentName: string): CodeSection[] {
    return [
      {
        statements: [...this.GenerateImports.createImports()],
      },
      {
        statements: [
          this.GenerateInterface.createPropsInterface(componentName),
        ],
      },

      {
        statements: [this.GenerateStyles.createStyleVariables()],
      },
      {
        statements: [
          this.GenerateComponent.createComponentFunction(componentName),
        ],
      },
    ];
  }

  /**
   * SourceFile을 생성하고 문자열로 변환
   */
  private createSourceFileFromStatements(
    statements: ts.Statement[]
  ): ts.SourceFile {
    return this.factory.createSourceFile(
      statements,
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );
  }

  /**
   * 섹션들을 문자열로 변환하고 연결
   */
  private printSections(sections: CodeSection[]): string {
    const printedSections = sections
      .map((section) => {
        const sourceFile = this.createSourceFileFromStatements(
          section.statements
        );
        return this.printer.printFile(sourceFile);
      })
      .filter((section) => section.trim().length > 0);

    return printedSections.join("\n\n");
  }

  /**
   * Prettier로 코드 포맷팅
   */
  private async formatCode(code: string): Promise<string> {
    return await prettier.format(code, ReactGenerator.PRETTIER_CONFIG);
  }
}

export default ReactGenerator;
