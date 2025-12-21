import { FinalAstTree } from "@compiler";

import ts, { NodeFactory } from "typescript";
import * as prettier from "prettier/standalone";
import * as parserTypeScript from "prettier/plugins/typescript";
import estreePlugin from "prettier/plugins/estree";

import GenerateImports from "./generate-imports/GenerateImports";
import GenerateStyles from "./generate-styles/GenerateStyles";
import GenerateInterface from "./generate-interface/GenerateInterface";
import GenerateComponent from "./generate-component/GenerateComponent";

class ReactGenerator {
  private astTree: FinalAstTree;
  private factory: NodeFactory;

  private GenerateImports: GenerateImports;
  private GenerateStyles: GenerateStyles;
  private GenerateInterface: GenerateInterface;
  private GenerateComponent: GenerateComponent;

  constructor(astTree: FinalAstTree) {
    this.astTree = astTree;
    const factory = (this.factory = ts.factory);

    this.GenerateImports = new GenerateImports(factory);
    this.GenerateStyles = new GenerateStyles(factory, astTree);
    this.GenerateInterface = new GenerateInterface(factory, astTree);
    this.GenerateComponent = new GenerateComponent(factory, astTree);
  }

  /**
   * SourceFile 생성 (모든 코드 합치기)
   */
  public buildSourceFile(componentName: string): ts.SourceFile {
    const statements: ts.Statement[] = [
      // Imports
      ...this.GenerateImports.createImports(),
      // Props Interface
      this.GenerateInterface.createPropsInterface(componentName),
      this.GenerateStyles.createStyleVariables(),
      // Component Function
      this.GenerateComponent.createComponentFunction(componentName),
    ];

    return this.factory.createSourceFile(
      statements,
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );
  }

  /**
   * 최종 코드 문자열 생성
   */
  public async generateComponentCode(componentName: string): Promise<string> {
    const sourceFile = this.buildSourceFile(componentName);
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: true,
    });
    const unformattedCode = printer.printFile(sourceFile);

    // Prettier standalone으로 포맷팅
    return await prettier.format(unformattedCode, {
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
    });
  }
}

export default ReactGenerator;
