/**
 * FigmaCodeGenerator
 *
 * Figma 디자인 데이터를 React 컴포넌트 코드로 변환하는 메인 엔트리포인트
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      High-Level Pipeline                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │   FigmaNodeData                                                 │
 * │        │                                                        │
 * │        ▼                                                        │
 * │   ┌─────────────┐                                               │
 * │   │ DataManager │  데이터 접근 레이어 (HashMap 기반 O(1) 조회)    │
 * │   └──────┬──────┘                                               │
 * │          │                                                      │
 * │          ▼                                                      │
 * │   ┌─────────────┐                                               │
 * │   │ TreeManager │  트리 구축 레이어                              │
 * │   │  └ TreeBuilder (6단계 파이프라인 + 휴리스틱)                 │
 * │   └──────┬──────┘                                               │
 * │          │ UITree                                               │
 * │          ▼                                                      │
 * │   ┌─────────────┐                                               │
 * │   │ CodeEmitter │  코드 생성 레이어                              │
 * │   │  └ StyleStrategy (Emotion / Tailwind)                      │
 * │   └──────┬──────┘                                               │
 * │          │                                                      │
 * │          ▼                                                      │
 * │   React Component Code (.tsx)                                   │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { FigmaNodeData, UITree, PropDefinition } from "./types/types";
import DataManager from "./layers/data-manager/DataManager";
import TreeManager from "./layers/tree-manager/TreeManager";
import type { ICodeEmitter, EmittedCode } from "./layers/code-emitter/ICodeEmitter";
import { ReactEmitter, type StyleStrategyType } from "./layers/code-emitter/react/ReactEmitter";
import { toComponentName } from "./utils/nameUtils";

export interface SlotInfo {
  componentSetId?: string;
  componentName?: string;
  hasDependency: boolean;
  mockupSvg?: string;
  width?: number;
  height?: number;
}

/**UI용 PropDefinition */
export interface LegacyPropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  slotInfo?: SlotInfo;
}

/**컴파일된 의존성 */
export interface CompiledDependency {
  id: string;
  name: string;
  code: string;
}

/**멀티 컴포넌트 결과 */
export interface MultiComponentResult {
  mainCode: string;
  mainName: string;
  dependencies: CompiledDependency[];
}

/** Tailwind 전략 옵션 */
export interface TailwindOptions {
  /** cn 함수를 인라인으로 생성할지 (기본: true) */
  inlineCn?: boolean;
  /** cn import 경로 (inlineCn: false일 때 사용, 기본: "@/lib/cn") */
  cnImportPath?: string;
}

/** 코드 생성 옵션 (v1 호환) */
export interface GeneratorOptions {
  /** 스타일 전략: emotion (기본) 또는 tailwind */
  styleStrategy?: StyleStrategyType | { type: StyleStrategyType; tailwind?: TailwindOptions };
  /** 디버그 모드: data-figma-id 속성 추가 */
  debug?: boolean;
}

/** 코드 생성 결과 */
export interface GeneratedResult {
  /** 메인 컴포넌트 코드 */
  main: EmittedCode;
  /** 의존 컴포넌트 코드 (componentId → code) */
  dependencies: Map<string, EmittedCode>;
}

class FigmaCodeGenerator {
  private readonly dataManager: DataManager;
  private readonly treeManager: TreeManager;
  private readonly codeEmitter: ICodeEmitter;

  constructor(spec: FigmaNodeData, options: GeneratorOptions = {}) {
    // Layer 1: 데이터 접근
    this.dataManager = new DataManager(spec);

    // Layer 2: 트리 구축
    this.treeManager = new TreeManager(this.dataManager);

    // Layer 3: 코드 생성 (현재 React만 지원, 추후 Vue/Svelte 확장 가능)
    // v1 호환: styleStrategy가 객체일 수 있음
    const styleStrategyObj = typeof options.styleStrategy === "object" ? options.styleStrategy : undefined;
    const styleStrategy = styleStrategyObj?.type ?? (typeof options.styleStrategy === "string" ? options.styleStrategy : "emotion");
    const tailwindOptions = styleStrategyObj?.tailwind;

    this.codeEmitter = new ReactEmitter({
      styleStrategy,
      debug: options.debug ?? false,
      tailwind: tailwindOptions,
    });
  }

  /**
   * 전체 파이프라인 실행: FigmaNodeData → React Code
   */
  async generate(): Promise<GeneratedResult> {
    // Step 1: UITree 구축
    const { main: mainTree, dependencies: depTrees } = this.treeManager.build();

    // Step 2: 코드 생성
    const mainCode = await this.codeEmitter.emit(mainTree);

    const depCodes = new Map<string, EmittedCode>();
    for (const [depId, depTree] of depTrees) {
      // dependency 루트의 고정 크기를 100%로 변환 (8px 붕괴 방지)
      this.makeRootFlexible(depTree);
      depCodes.set(depId, await this.codeEmitter.emit(depTree));
    }

    return {
      main: mainCode,
      dependencies: depCodes,
    };
  }

  /**
   * UITree만 반환 (디버깅/테스트용)
   */
  buildUITree(): { main: UITree; dependencies: Map<string, UITree> } {
    return this.treeManager.build();
  }

  /**
   * 단일 UITree → 코드 변환 (디버깅/테스트용)
   */
  async emitCode(uiTree: UITree): Promise<EmittedCode> {
    return this.codeEmitter.emit(uiTree);
  }

  /**
   * 코드 생성
   */
  async compile(): Promise<string | null> {
    try {
      const result = await this.generate();

      // dependencies가 있으면 함께 번들링 (변수명 충돌 방지)
      if (result.dependencies.size > 0) {
        // 중복 제거: 같은 componentName을 가진 dependency는 한 번만 포함
        const seenComponents = new Set<string>();
        const uniqueDeps = Array.from(result.dependencies.values()).filter(dep => {
          if (seenComponents.has(dep.componentName)) {
            return false;
          }
          seenComponents.add(dep.componentName);
          return true;
        });

        // 번들링: import 정리 + 코드 결합 (미참조 deps 제거)
        const referencedDeps = this.filterReferencedDependencies(result.main, uniqueDeps);
        return this.bundleCode(result.main, referencedDeps);
      }

      // 분리형 export → 합체형 export default function
      return this.mergeExportDefault(result.main.code, result.main.componentName);
    } catch (e) {
      console.error("Compile error:", e);
      return null;
    }
  }

  /**
   * 메인 코드와 dependencies를 번들링 (import 정리)
   */
  private bundleCode(main: EmittedCode, deps: EmittedCode[]): string {
    const mainName = main.componentName;

    const allCodes = [...deps, main];

    // Step 0: 이름 충돌 감지 및 리네임 맵 생성
    const renameMap = new Map<string, string>(); // originalName → renamedName
    for (const dep of deps) {
      if (dep.componentName === mainName) {
        renameMap.set(dep.componentName, `_${dep.componentName}`);
      }
    }

    // Step 1: 모든 코드에서 import 추출
    const reactImports = new Set<string>();

    for (const emitted of allCodes) {
      const importMatches = emitted.code.matchAll(/^import .+ from ['""](.+)['""]/gm);
      for (const match of importMatches) {
        const importLine = match[0];
        const importPath = match[1];

        // React/스타일 라이브러리/유틸리티 import는 유지 (내부 컴포넌트 import만 제거)
        const isInternalComponent = importPath.startsWith("./") || importPath.startsWith("../");
        if (!isInternalComponent) {
          reactImports.add(importLine);
        }
      }
    }

    // Step 2: dependency 코드에서 모든 import 제거 + CSS 변수명 변경 + cn 중복 제거
    const depCodesClean = deps.map(dep => {
      const renamedName = renameMap.get(dep.componentName) || dep.componentName;
      let code = this.renameCssVariables(dep.code, dep.componentName);
      // 모든 import 제거
      code = code.replace(/^import .+;?\n/gm, "");
      // cn 함수 선언 제거 (Prettier 포맷으로 여러 줄에 걸칠 수 있음)
      code = this.removeCnDeclaration(code);
      // v2: function declaration → arrow function const
      // "function X(props) { ... }\n\nexport default X;" →
      // "const X: React.FC<XProps> = (props) => { ... };"
      code = this.convertToArrowFunction(code, dep.componentName);
      // export default X; 제거 (분리형 export)
      code = code.replace(/^export default \w+;\s*$/gm, "");
      // interface에서 export 제거 (dependency는 내부)
      code = code.replace(/^export (interface \w+Props)/gm, "$1");

      // 이름 충돌 시 리네임 (함수명, interface명, Props 타입 참조 모두)
      if (renamedName !== dep.componentName) {
        const origName = dep.componentName;
        // const Name: → const _Name:
        code = code.replace(
          new RegExp(`\\bconst ${origName}:`, "g"),
          `const ${renamedName}:`
        );
        // function Name( → function _Name( (fallback)
        code = code.replace(
          new RegExp(`\\bfunction ${origName}\\b`, "g"),
          `function ${renamedName}`
        );
        // interface NameProps → interface _NameProps
        code = code.replace(
          new RegExp(`\\binterface ${origName}Props\\b`, "g"),
          `interface ${renamedName}Props`
        );
        // React.FC<NameProps> → React.FC<_NameProps>
        code = code.replace(
          new RegExp(`React\\.FC<${origName}Props>`, "g"),
          `React.FC<${renamedName}Props>`
        );
        // : NameProps → : _NameProps (타입 참조)
        code = code.replace(
          new RegExp(`:\\s*${origName}Props\\b`, "g"),
          `: ${renamedName}Props`
        );
      }

      return code.trim();
    });

    // Step 3: main 코드에서 모든 import 제거
    let mainCodeClean = main.code;
    mainCodeClean = mainCodeClean.replace(/^import .+;?\n/gm, "");
    mainCodeClean = mainCodeClean.trim();

    // Step 3.5: cn 함수 추출 (main에서 가져와 최상단에 배치)
    const cnDeclaration = this.extractCnDeclaration(mainCodeClean);
    if (cnDeclaration) {
      mainCodeClean = this.removeCnDeclaration(mainCodeClean);
      mainCodeClean = mainCodeClean.trim();
    }

    // Step 3.6: export default를 function 선언에 합치기
    // "function X(props) { ... }\n\nexport default X;" → "export default function X(props) { ... }"
    mainCodeClean = this.mergeExportDefault(mainCodeClean, mainName);

    // Step 3.7: main 코드에서 충돌 dependency 참조를 리네임된 이름으로 변경
    for (const [origName, renamedName] of renameMap) {
      // JSX 태그 참조: <Label → <_Label, </Label> → </_Label>
      mainCodeClean = mainCodeClean.replace(
        new RegExp(`<${origName}([\\s/>])`, "g"),
        `<${renamedName}$1`
      );
      mainCodeClean = mainCodeClean.replace(
        new RegExp(`</${origName}>`, "g"),
        `</${renamedName}>`
      );
    }

    // Step 4: 결합 (React imports + cn + dependencies + main)
    const parts = [Array.from(reactImports).join("\n")];
    if (cnDeclaration) {
      parts.push("", cnDeclaration);
    }
    parts.push("", depCodesClean.join("\n\n"), "", mainCodeClean);
    const bundled = parts.join("\n");

    return bundled;
  }

  /**
   * CSS 변수명에 prefix 추가하여 충돌 방지
   * 예: btnCss → Button_btnCss
   */
  private renameCssVariables(code: string, componentName: string): string {
    const prefix = componentName.replace(/\s+/g, "");

    // CSS 변수 패턴: xxxCss, xxxStyles, xxxClasses 등 (숫자 접미사 _2, _3 포함)
    const styleVarPattern = /\b(\w+(?:Css|Styles|Classes)(?:_\d+)?)\b/g;
    const foundVars = new Set<string>();

    // Step 1: 코드에서 스타일 변수명 수집
    let match;
    while ((match = styleVarPattern.exec(code)) !== null) {
      foundVars.add(match[1]);
    }

    // Step 2: 각 변수명을 prefix된 이름으로 교체
    let renamedCode = code;
    for (const varName of foundVars) {
      const newName = `${prefix}_${varName}`;
      // 단어 경계를 사용하여 정확한 매칭
      const regex = new RegExp(`\\b${varName}\\b`, "g");
      renamedCode = renamedCode.replace(regex, newName);
    }

    return renamedCode;
  }

  /**
   * Props 정의 반환 (UI 컨트롤러용)
   */
  getPropsDefinition(): LegacyPropDefinition[] {
    const uiTree = this.buildUITree().main;
    return uiTree.props.map(prop => this.toLegacyPropDefinition(prop));
  }

  /**
   * 컴포넌트 이름 반환
   */
  getComponentName(): string {
    const mainId = this.dataManager.getMainComponentId();
    const { node } = this.dataManager.getById(mainId);
    return toComponentName(node?.name ?? "Component");
  }

  /**
   * 멀티 컴포넌트 컴파일 결과 반환
   */
  async getGeneratedCodeWithDependencies(): Promise<MultiComponentResult> {
    const result = await this.generate();

    const dependencies: CompiledDependency[] = [];
    for (const [id, emitted] of result.dependencies) {
      dependencies.push({
        id,
        name: emitted.componentName,
        code: emitted.code,
      });
    }

    return {
      mainCode: result.main.code,
      mainName: result.main.componentName,
      dependencies,
    };
  }

  /**
   * cn 함수 선언을 코드에서 추출 (Prettier 포맷된 여러 줄 포함)
   */
  private extractCnDeclaration(code: string): string {
    // 패턴: const cn = (...) => ... .join(...); (한 줄 또는 여러 줄)
    const match = code.match(/^const cn = \([\s\S]*?\);\s*$/m) ||
                  code.match(/const cn = [\s\S]*?\.join\([\s\S]*?\);/);
    return match ? match[0] : "";
  }

  /**
   * cn 함수 선언을 코드에서 제거
   */
  private removeCnDeclaration(code: string): string {
    // const cn = ... 부터 .join(...); 까지 제거 (여러 줄 가능)
    return code.replace(/const cn = [\s\S]*?\.join\([\s\S]*?\);\n*/g, "");
  }

  /**
   * v2: function declaration → arrow function const (dependency용)
   * "function X(props) { ... }\n\nexport default X;" →
   * "const X: React.FC<XProps> = (props) => { ... };"
   */
  private convertToArrowFunction(code: string, componentName: string): string {
    // export default function X(props) → const X: React.FC<XProps> = (props) =>
    const exportDefaultFuncRegex = new RegExp(
      `export\\s+default\\s+function\\s+${componentName}\\s*\\(([^)]*)\\)\\s*\\{`
    );
    let match = code.match(exportDefaultFuncRegex);
    if (match) {
      code = code.replace(
        exportDefaultFuncRegex,
        `const ${componentName}: React.FC<${componentName}Props> = (${match[1]}) => {`
      );
      // 마지막 closing brace + export default 제거
      code = code.replace(/^export default \w+;\s*$/gm, "");
      // 함수 끝의 } 를 }; 로 변경 (arrow function은 const이므로)
      code = this.replaceLastClosingBrace(code, componentName);
      return code;
    }

    // function X(props) { ... }\n\nexport default X; 패턴
    const funcRegex = new RegExp(
      `function\\s+${componentName}\\s*\\(([^)]*)\\)\\s*\\{`
    );
    match = code.match(funcRegex);
    if (match) {
      code = code.replace(
        funcRegex,
        `const ${componentName}: React.FC<${componentName}Props> = (${match[1]}) => {`
      );
      code = this.replaceLastClosingBrace(code, componentName);
    }

    return code;
  }

  /**
   * arrow function const의 마지막 closing brace를 }; 로 변경
   */
  private replaceLastClosingBrace(code: string, componentName: string): string {
    // const X: ... = (props) => { 부분을 찾아 매칭되는 마지막 } 를 }; 로 변경
    const arrowStart = code.indexOf(`const ${componentName}:`);
    if (arrowStart === -1) return code;

    // { 의 깊이를 추적하여 매칭되는 } 찾기
    const funcBodyStart = code.indexOf("{", code.indexOf("=>", arrowStart));
    if (funcBodyStart === -1) return code;

    let depth = 0;
    let lastBraceIdx = -1;
    // 템플릿 리터럴 내부인지 추적
    let inTemplateLiteral = false;
    let inString: string | false = false;

    for (let i = funcBodyStart; i < code.length; i++) {
      const char = code[i];

      // 문자열 추적 (간단하게)
      if (!inTemplateLiteral && !inString && (char === '"' || char === "'")) {
        inString = char;
        continue;
      }
      if (inString && char === inString && code[i - 1] !== "\\") {
        inString = false;
        continue;
      }
      if (inString) continue;

      // 템플릿 리터럴 추적
      if (char === "`") {
        inTemplateLiteral = !inTemplateLiteral;
        continue;
      }
      if (inTemplateLiteral) continue;

      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          lastBraceIdx = i;
          break;
        }
      }
    }

    if (lastBraceIdx !== -1) {
      // } 뒤에 ; 이 없으면 추가
      const after = code.slice(lastBraceIdx + 1).trimStart();
      if (!after.startsWith(";")) {
        code = code.slice(0, lastBraceIdx + 1) + ";" + code.slice(lastBraceIdx + 1);
      }
    }

    return code;
  }

  /**
   * 분리형 export → 합체형 export default function
   * "function X(props) { ... }\n\nexport default X;" → "export default function X(props) { ... }"
   */
  private mergeExportDefault(code: string, componentName: string): string {
    const funcMatch = code.match(
      new RegExp(`(function ${componentName}\\()([\\s\\S]*?)\\n\\nexport default ${componentName};`)
    );
    if (funcMatch) {
      return code.replace(
        funcMatch[0],
        `export default ${funcMatch[1]}${funcMatch[2]}`
      );
    }
    return code;
  }

  /**
   * dependency 루트의 고정 크기를 100%로 변환
   * INSTANCE가 parent의 크기를 채우도록 함 (8px 붕괴 방지)
   */
  private makeRootFlexible(tree: UITree): void {
    const root = tree.root;
    if (!root.styles) return;

    const base = root.styles.base;
    // 고정 px 크기를 100%로 변환
    if (base.width && typeof base.width === "string" && base.width.endsWith("px")) {
      base.width = "100%";
    }
    if (base.height && typeof base.height === "string" && base.height.endsWith("px")) {
      base.height = "100%";
    }

    // 시각적 스타일 제거 (wrapper가 담당)
    // background → transparent, padding/border-radius/border/opacity 제거
    if (base.background) {
      base.background = "transparent";
    }
    delete base["border-radius"];
    delete base.border;
    delete base.opacity;
    delete base.padding;
    delete base["padding-top"];
    delete base["padding-right"];
    delete base["padding-bottom"];
    delete base["padding-left"];

    // variant별 스타일에서도 시각적 스타일 제거
    if (root.styles.variants) {
      for (const [, variantStyles] of Object.entries(root.styles.variants)) {
        for (const [, styleObj] of Object.entries(variantStyles as Record<string, any>)) {
          if (styleObj && typeof styleObj === "object") {
            if (styleObj.background) {
              styleObj.background = "transparent";
            }
            delete styleObj["border-radius"];
            delete styleObj.border;
            delete styleObj.opacity;
          }
        }
      }
    }
  }

  /**
   * 다른 코드(main 또는 다른 deps)에서 전혀 참조되지 않는 dep을 제거.
   * dep의 componentName이 자기 자신 코드에만 등장하고
   * main + 다른 deps 코드 어디에도 없으면 제외.
   */
  private filterReferencedDependencies(main: EmittedCode, deps: EmittedCode[]): EmittedCode[] {
    // 자기 자신 코드를 제외한 모든 코드 합치기
    return deps.filter((dep) => {
      const otherCodes = [main.code, ...deps.filter(d => d !== dep).map(d => d.code)].join("\n");
      return otherCodes.includes(dep.componentName);
    });
  }

  private toLegacyPropDefinition(prop: PropDefinition): LegacyPropDefinition {
    const typeMap: Record<string, "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT"> = {
      variant: "VARIANT",
      string: "TEXT",
      boolean: "BOOLEAN",
      slot: "SLOT",
    };

    return {
      name: prop.name,
      type: typeMap[prop.type] ?? "TEXT",
      defaultValue: prop.defaultValue,
      variantOptions: prop.type === "variant" ? (prop as any).options : undefined,
    };
  }

}

export default FigmaCodeGenerator;
