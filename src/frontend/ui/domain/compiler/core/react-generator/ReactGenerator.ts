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
import { capitalize, normalizeName } from "@compiler/utils/stringUtils";
import { ArraySlot } from "@compiler/core/ArraySlotDetector";

interface CodeSection {
  statements: ts.Statement[];
}

class ReactGenerator {
  private astTree: FinalAstTree;
  private factory: NodeFactory;
  private arraySlots: ArraySlot[];

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

  private _componentName: string;

  constructor(astTree: FinalAstTree, arraySlots: ArraySlot[] = []) {
    this.astTree = astTree;
    this.arraySlots = arraySlots;
    const factory = (this.factory = ts.factory);

    this._componentName = astTree.metaData.document.name ?? astTree.name;
    this._componentName = capitalize(normalizeName(this._componentName));

    this.printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: true,
    });

    // AST에서 사용된 외부 컴포넌트 목록 수집
    const externalComponents = this._collectExternalComponents(astTree);

    this.GenerateImports = new GenerateImports(factory, externalComponents);
    this.GenerateInterface = new GenerateInterface(factory, astTree, arraySlots);
    this.GenerateStyles = new GenerateStyles(factory, astTree);
    this.GenerateComponent = new GenerateComponent(factory, astTree, arraySlots);
  }

  /**
   * AST에서 사용된 외부 컴포넌트 목록 수집
   * externalComponent가 있는 노드들을 찾아서 componentName 중복 제거
   */
  private _collectExternalComponents(
    astTree: FinalAstTree
  ): { componentName: string; componentSetId: string }[] {
    const componentsMap = new Map<string, string>(); // componentSetId → componentName

    const traverse = (node: FinalAstTree) => {
      if (node.externalComponent) {
        const { componentSetId, componentName } = node.externalComponent;
        if (!componentsMap.has(componentSetId)) {
          componentsMap.set(componentSetId, componentName);
        }
      }
      node.children.forEach(traverse);
    };

    traverse(astTree);

    return Array.from(componentsMap.entries()).map(
      ([componentSetId, componentName]) => ({
        componentSetId,
        componentName,
      })
    );
  }

  /**
   * 최종 코드 문자열 생성
   */
  public async generateComponentCode(componentName: string): Promise<string> {
    const sections = this.createCodeSections(componentName);

    const unformattedCode = this.printSections(sections);

    const rtnVal = await this.formatCode(unformattedCode);

    return rtnVal;
  }

  /**
   * 각 코드 섹션 생성
   */
  private createCodeSections(componentName: string): CodeSection[] {
    // 전달된 componentName 우선 사용, 없으면 AST에서 추출한 이름 사용
    componentName = componentName || this._componentName;

    return [
      {
        statements: [...this.GenerateImports.createImports()],
      },
      {
        statements: [
          ...this.GenerateInterface.createPropTypeAliases(),
          this.GenerateInterface.createPropsInterface(componentName),
        ],
      },

      {
        statements: this.GenerateStyles.createStyleVariables(componentName),
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
   * 포맷팅 실패 시 원본 코드 반환
   */
  private async formatCode(code: string): Promise<string> {
    try {
      return await prettier.format(code, ReactGenerator.PRETTIER_CONFIG);
    } catch (error) {
      console.warn("Prettier formatting failed, returning unformatted code:", error);
      return code;
    }
  }
}

export default ReactGenerator;
