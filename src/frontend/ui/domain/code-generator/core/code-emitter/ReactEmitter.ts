/**
 * ReactEmitter
 *
 * ICodeEmitter 구현체
 * DesignTree를 React 컴포넌트 코드로 직접 변환합니다.
 *
 * Phase 5 리팩토링 후: Adapter 레이어와 레거시 ReactGenerator를 제거하고,
 * 새로운 generators와 StyleStrategy를 사용하여 DesignTree에서 직접 코드를 생성합니다.
 *
 * 파이프라인: DesignTree → ReactEmitter → 코드
 */

import ts from "typescript";
import prettier from "prettier";
import parserTypescript from "prettier/plugins/typescript";

import type {
  ICodeEmitter,
  CodeEmitterPolicy,
  DesignTree,
  EmittedCode,
  ImportStatement,
} from "@code-generator/types/architecture";

import {
  ImportsGenerator,
  InterfaceGenerator,
  StylesGenerator,
  ComponentGenerator,
} from "./generators";
import type { IStyleStrategy } from "./style-strategy/IStyleStrategy";
import { EmotionStyleStrategy, TailwindStyleStrategy } from "./style-strategy";
import { toPascalCase } from "./utils";

/**
 * ReactEmitter
 *
 * ICodeEmitter 인터페이스를 구현하여 DesignTree를 React 코드로 변환합니다.
 * 새로운 generators를 사용하여 레거시 없이 직접 코드를 생성합니다.
 *
 * @example
 * ```typescript
 * const emitter = new ReactEmitter();
 * const result = await emitter.emit(designTree, {
 *   platform: "react",
 *   styleStrategy: "emotion"
 * });
 * console.log(result.code); // React 컴포넌트 코드
 * ```
 */
class ReactEmitter implements ICodeEmitter {
  private factory: ts.NodeFactory;

  /**
   * ReactEmitter 생성자
   * TypeScript NodeFactory를 초기화합니다.
   */
  constructor() {
    this.factory = ts.factory;
  }

  /**
   * DesignTree를 React 코드로 변환
   *
   * @param tree - TreeBuilder가 출력한 DesignTree
   * @param policy - 코드 생성 정책 (스타일 전략, 컨벤션 등)
   * @returns EmittedCode (코드, imports, types, componentName)
   */
  async emit(tree: DesignTree, policy: CodeEmitterPolicy): Promise<EmittedCode> {
    // 1. StyleStrategy 생성
    const strategy = this.createStyleStrategy(policy);

    // 2. 컴포넌트 이름 결정
    const componentName = toPascalCase(tree.root.name);

    // 3. 각 섹션 생성
    const importsGen = new ImportsGenerator(this.factory);
    const interfaceGen = new InterfaceGenerator(this.factory);
    const stylesGen = new StylesGenerator(this.factory);
    const componentGen = new ComponentGenerator(this.factory, {
      debug: policy.debug,
    });

    const importStmts = importsGen.generate(tree, strategy);
    const interfaceStmts = interfaceGen.generate(tree, componentName);
    const styleStmts = stylesGen.generate(tree, componentName, strategy);
    const componentStmt = componentGen.generate(tree, componentName, strategy);

    // 4. AST → 코드 문자열
    const allStatements = [
      ...importStmts,
      ...interfaceStmts,
      ...styleStmts,
      componentStmt,
    ];

    const code = this.printStatements(allStatements);

    // 5. 코드 포맷팅
    const formattedCode = await this.formatCode(code, policy.prettier);

    // 6. EmittedCode 구성
    return {
      code: formattedCode,
      imports: this.extractImports(formattedCode, policy),
      types: this.extractTypes(formattedCode, componentName),
      componentName,
    };
  }

  /**
   * Policy에 따라 StyleStrategy 생성
   * @param policy - 코드 생성 정책
   * @returns 스타일 전략 인스턴스 (Emotion 또는 Tailwind)
   */
  private createStyleStrategy(policy: CodeEmitterPolicy): IStyleStrategy {
    switch (policy.styleStrategy) {
      case "tailwind":
        return new TailwindStyleStrategy(this.factory, {
          inlineCn: policy.tailwindOptions?.inlineCn ?? true,
          cnImportPath: policy.tailwindOptions?.cnImportPath || "@/lib/utils",
        });

      case "emotion":
      default:
        return new EmotionStyleStrategy(this.factory);
    }
  }

  /**
   * TypeScript AST statements를 코드 문자열로 변환
   * @param statements - TypeScript AST Statement 배열
   * @returns 변환된 코드 문자열
   */
  private printStatements(statements: ts.Statement[]): string {
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      omitTrailingSemicolon: false,
    });

    const sourceFile = ts.createSourceFile(
      "component.tsx",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX
    );

    const resultFile = ts.factory.updateSourceFile(sourceFile, statements);

    return printer.printFile(resultFile);
  }

  /**
   * Prettier로 코드 포맷팅
   * @param code - 포맷팅할 코드 문자열
   * @param prettierConfig - Prettier 설정 (선택적)
   * @returns 포맷팅된 코드 문자열
   */
  private async formatCode(
    code: string,
    prettierConfig?: CodeEmitterPolicy["prettier"]
  ): Promise<string> {
    try {
      const formatted = await prettier.format(code, {
        parser: "typescript",
        plugins: [parserTypescript],
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        printWidth: 80,
        trailingComma: "es5",
        ...prettierConfig,
      });
      return formatted;
    } catch (error) {
      // 포맷팅 실패 시 원본 반환
      console.warn("Prettier formatting failed:", error);
      return code;
    }
  }

  /**
   * 코드에서 import 문 추출
   * @param code - 분석할 코드 문자열
   * @param policy - 코드 생성 정책 (추가 imports 포함)
   * @returns 추출된 ImportStatement 배열
   */
  private extractImports(
    code: string,
    policy: CodeEmitterPolicy
  ): ImportStatement[] {
    const imports: ImportStatement[] = [];
    const importRegex =
      /^import\s+(?:(\w+)|{([^}]+)}|\*\s+as\s+(\w+))\s+from\s+["']([^"']+)["'];?$/gm;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const [, defaultImport, namedImportsStr, namespaceImport, module] = match;

      const statement: ImportStatement = {
        module,
      };

      if (defaultImport) {
        statement.defaultImport = defaultImport;
      }

      if (namedImportsStr) {
        statement.namedImports = namedImportsStr
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }

      if (namespaceImport) {
        statement.defaultImport = namespaceImport;
      }

      imports.push(statement);
    }

    // 추가 imports (policy에서 지정된 경우)
    if (policy.additionalImports) {
      imports.push(...policy.additionalImports);
    }

    return imports;
  }

  /**
   * 코드에서 타입 정의 추출
   * @param code - 분석할 코드 문자열
   * @param componentName - 컴포넌트 이름 (Props 인터페이스 검색용)
   * @returns 추출된 타입 정의 문자열
   */
  private extractTypes(code: string, componentName: string): string {
    const typeRegex = new RegExp(
      `(?:export\\s+)?(?:interface|type)\\s+${componentName}Props[^{]*{[^}]*}`,
      "g"
    );

    const matches = code.match(typeRegex);
    return matches ? matches.join("\n\n") : "";
  }
}

export default ReactEmitter;
