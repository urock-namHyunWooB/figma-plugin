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
   * 최종 코드 문자열 생성
   */
  public async generateComponentCode(componentName: string): Promise<string> {
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: true,
    });

    // 각 섹션을 개별 SourceFile로 생성
    const importStatements = this.GenerateImports.createImports();
    const interfaceStatement =
      this.GenerateInterface.createPropsInterface(componentName);
    const styleStatement = this.GenerateStyles.createStyleVariables();
    const componentStatement =
      this.GenerateComponent.createComponentFunction(componentName);

    const importFile = this.factory.createSourceFile(
      importStatements,
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );

    const interfaceFile = this.factory.createSourceFile(
      [interfaceStatement],
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );

    const styleFile = this.factory.createSourceFile(
      [styleStatement],
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );

    const componentFile = this.factory.createSourceFile(
      [componentStatement],
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );

    // 각 섹션을 print하고 빈 줄로 연결
    const sections = [
      printer.printFile(importFile),
      printer.printFile(interfaceFile),
      printer.printFile(styleFile),
      printer.printFile(componentFile),
    ].filter((section) => section.trim().length > 0); // 빈 섹션 제거

    const unformattedCode = sections.join("\n\n"); // 빈 줄로 연결

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
