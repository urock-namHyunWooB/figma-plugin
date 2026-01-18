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
import {
  StyleStrategy,
  StyleStrategyOptions,
  createStyleStrategy,
} from "./style-strategy";

interface CodeSection {
  statements: ts.Statement[];
}

/**
 * ReactGenerator 옵션
 */
export interface ReactGeneratorOptions {
  /** 스타일 전략 옵션 (기본: emotion) */
  styleStrategy?: StyleStrategyOptions;
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
}

class ReactGenerator {
  private astTree: FinalAstTree;
  private factory: NodeFactory;
  private arraySlots: ArraySlot[];
  private options: ReactGeneratorOptions;

  private GenerateImports: GenerateImports;
  private GenerateStyles: GenerateStyles;
  private GenerateInterface: GenerateInterface;
  private GenerateComponent: GenerateComponent;

  /** 스타일 전략 (Emotion 또는 Tailwind) */
  private styleStrategy: StyleStrategy;

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

  constructor(
    astTree: FinalAstTree,
    arraySlots: ArraySlot[] = [],
    options?: ReactGeneratorOptions
  ) {
    this.astTree = astTree;
    this.arraySlots = arraySlots;
    this.options = options || {};
    const factory = (this.factory = ts.factory);

    this._componentName = astTree.metaData.document.name ?? astTree.name;
    this._componentName = capitalize(normalizeName(this._componentName));

    this.printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: true,
    });

    // 스타일 전략 생성
    this.styleStrategy = createStyleStrategy(
      factory,
      astTree,
      this.options.styleStrategy
    );

    // AST에서 사용된 외부 컴포넌트 목록 수집
    const externalComponents = this._collectExternalComponents(astTree);

    this.GenerateImports = new GenerateImports(factory, externalComponents);
    this.GenerateInterface = new GenerateInterface(
      factory,
      astTree,
      arraySlots
    );
    this.GenerateStyles = new GenerateStyles(factory, astTree);
    this.GenerateComponent = new GenerateComponent(
      factory,
      astTree,
      arraySlots,
      {
        styleStrategy: this.styleStrategy,
        debug: this.options.debug,
      }
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
   * 각 코드 섹션 생성
   */
  private createCodeSections(componentName: string): CodeSection[] {
    // 전달된 componentName 우선 사용, 없으면 AST에서 추출한 이름 사용
    componentName = componentName || this._componentName;

    const isEmotionStrategy = this.styleStrategy.name === "emotion";

    // Import 문: 기본 import + 스타일 전략별 import
    const imports = [
      ...this.GenerateImports.createImports().filter((imp) => {
        // Emotion 전략이 아닌 경우 @emotion/react import 제거
        if (!isEmotionStrategy) {
          const moduleSpecifier = (imp.moduleSpecifier as ts.StringLiteral)
            .text;
          return !moduleSpecifier.includes("@emotion");
        }
        return true;
      }),
      ...this.styleStrategy.generateImports(),
    ];

    // 스타일 선언부: 전략에 따라 다르게 생성
    const styleStatements = isEmotionStrategy
      ? this.GenerateStyles.createStyleVariables(componentName)
      : this.styleStrategy.generateDeclarations(this.astTree, componentName);

    return [
      {
        statements: imports,
      },
      {
        statements: [
          ...this.GenerateInterface.createPropTypeAliases(),
          this.GenerateInterface.createPropsInterface(componentName),
        ],
      },
      {
        statements: styleStatements,
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
        // 각 statement를 개별로 출력하여 줄바꿈 추가
        const printedStatements = section.statements.map((statement) => {
          const sourceFile = this.createSourceFileFromStatements([statement]);
          return this.printer.printFile(sourceFile).trim();
        });
        return printedStatements.join("\n\n");
      })
      .filter((section) => section.trim().length > 0);

    return printedSections.join("\n\n");
  }

  /**
   * Prettier로 코드 포맷팅
   * 테스트 환경에서는 포맷팅을 스킵하고, 포맷팅 실패 시 원본 코드 반환
   */
  private async formatCode(code: string): Promise<string> {
    // 테스트 환경에서는 Prettier 포맷팅 스킵 (성능 향상 + 스택 오버플로우 방지)
    if (
      typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITEST
    ) {
      return code;
    }

    try {
      return await prettier.format(code, ReactGenerator.PRETTIER_CONFIG);
    } catch (error) {
      console.warn(
        "Prettier formatting failed, returning unformatted code:",
        error
      );
      return code;
    }
  }
}

export default ReactGenerator;
