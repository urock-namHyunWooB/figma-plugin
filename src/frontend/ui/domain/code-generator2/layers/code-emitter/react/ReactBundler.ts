/**
 * ReactBundler
 *
 * 여러 EmittedCode를 하나의 React 파일로 번들링
 *
 * - import 추출/병합
 * - CSS 변수명 충돌 방지 (prefix 추가)
 * - function → arrow function 변환 (dependency용)
 * - cn 함수 중복 제거
 * - 이름 충돌 리네이밍
 */

import type { EmittedCode } from "../ICodeEmitter";
import { type DeclarationStyle } from "./generators/JsxGenerator";

export class ReactBundler {
  private readonly declarationStyle: DeclarationStyle;

  constructor(options?: { declarationStyle?: DeclarationStyle }) {
    this.declarationStyle = options?.declarationStyle ?? "function";
  }
  /**
   * main + deps를 단일 파일로 번들링
   * deps가 없거나 모두 미참조이면 main만 export default로 반환
   */
  bundle(main: EmittedCode, deps: EmittedCode[]): string {
    const uniqueDeps = this.deduplicateByName(deps);
    const referencedDeps = this.filterReferencedDependencies(
      main,
      uniqueDeps
    );

    if (referencedDeps.length === 0) {
      return this.mergeExportDefault(main.code, main.componentName);
    }

    return this.bundleCode(main, referencedDeps);
  }

  private deduplicateByName(deps: EmittedCode[]): EmittedCode[] {
    const seen = new Set<string>();
    return deps.filter((dep) => {
      if (seen.has(dep.componentName)) return false;
      seen.add(dep.componentName);
      return true;
    });
  }

  /**
   * main/다른 deps 코드에서 전혀 참조되지 않는 dep을 제거
   */
  private filterReferencedDependencies(
    main: EmittedCode,
    deps: EmittedCode[]
  ): EmittedCode[] {
    return deps.filter((dep) => {
      const otherCodes = [
        main.code,
        ...deps.filter((d) => d !== dep).map((d) => d.code),
      ].join("\n");
      return otherCodes.includes(dep.componentName);
    });
  }

  /**
   * 메인 코드와 dependencies를 번들링 (import 정리)
   */
  private bundleCode(main: EmittedCode, deps: EmittedCode[]): string {
    const mainName = main.componentName;

    const allCodes = [...deps, main];

    // Step 0: 이름 충돌 감지 및 리네임 맵 생성
    const renameMap = new Map<string, string>();
    for (const dep of deps) {
      if (dep.componentName === mainName) {
        renameMap.set(dep.componentName, `_${dep.componentName}`);
      }
    }

    // Step 1: 모든 코드에서 import 추출 (같은 모듈 경로는 병합)
    const importsByKey = new Map<string, string>();

    for (const emitted of allCodes) {
      const importMatches = emitted.code.matchAll(
        /^import .+ from ['""](.+)['""]/gm
      );
      for (const match of importMatches) {
        const importLine = match[0];
        const importPath = match[1];

        const isInternalComponent =
          importPath.startsWith("./") || importPath.startsWith("../");
        if (!isInternalComponent) {
          const isTypeOnly = /^import\s+type\s/.test(importLine);
          const key = `${isTypeOnly ? "type:" : ""}${importPath}`;
          const existing = importsByKey.get(key);
          if (!existing) {
            importsByKey.set(key, importLine);
          } else {
            importsByKey.set(
              key,
              this.mergeImportLines(existing, importLine)
            );
          }
        }
      }
    }

    // Step 2: dependency 코드에서 모든 import 제거 + CSS 변수명 변경 + cn 중복 제거
    const depCodesClean = deps.map((dep) => {
      const renamedName =
        renameMap.get(dep.componentName) || dep.componentName;
      let code = this.renameCssVariables(dep.code, dep.componentName);
      code = code.replace(/^import .+;?\n/gm, "");
      code = this.removeCnDeclaration(code);
      code = this.convertDeclarationStyle(code, dep.componentName);
      code = code.replace(/^export (interface \w+Props)/gm, "$1");

      if (renamedName !== dep.componentName) {
        code = this.applyRename(code, dep.componentName, renamedName);
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
    mainCodeClean = this.mergeExportDefault(mainCodeClean, mainName);

    // Step 3.7: main 코드에서 충돌 dependency 참조를 리네임된 이름으로 변경
    for (const [origName, renamedName] of renameMap) {
      mainCodeClean = mainCodeClean.replace(
        new RegExp(`<${origName}([\\s/>])`, "g"),
        `<${renamedName}$1`
      );
      mainCodeClean = mainCodeClean.replace(
        new RegExp(`</${origName}>`, "g"),
        `</${renamedName}>`
      );
    }

    // Step 3.8: <button> 중첩 방지 — dep의 <button> 루트를 <div>로 변환하여 루트 button에 위임
    const hasButtonRoot = /return\s*\(\s*<button[\s/>]/.test(mainCodeClean);
    const finalDepCodes = hasButtonRoot
      ? depCodesClean.map((code) => {
          const neutralized = this.neutralizeButtonRoot(code);
          // button → div 변환 시 props 타입도 동기화
          if (neutralized !== code) {
            return neutralized.replace(
              /React\.ButtonHTMLAttributes<HTMLButtonElement>/g,
              "React.HTMLAttributes<HTMLDivElement>"
            );
          }
          return neutralized;
        })
      : depCodesClean;

    // Step 4: 결합 (React imports + cn + dependencies + main)
    const parts = [Array.from(importsByKey.values()).join("\n")];
    if (cnDeclaration) {
      parts.push("", cnDeclaration);
    }
    parts.push("", finalDepCodes.join("\n\n"), "", mainCodeClean);
    return parts.join("\n");
  }

  /**
   * 이름 충돌 시 함수명, interface명, Props 타입 참조를 일괄 리네임
   */
  private applyRename(
    code: string,
    origName: string,
    renamedName: string
  ): string {
    code = code.replace(
      new RegExp(`\\bconst ${origName}:`, "g"),
      `const ${renamedName}:`
    );
    code = code.replace(
      new RegExp(`\\bfunction ${origName}\\b`, "g"),
      `function ${renamedName}`
    );
    code = code.replace(
      new RegExp(`\\binterface ${origName}Props\\b`, "g"),
      `interface ${renamedName}Props`
    );
    code = code.replace(
      new RegExp(`React\\.FC<${origName}Props>`, "g"),
      `React.FC<${renamedName}Props>`
    );
    code = code.replace(
      new RegExp(`:\\s*${origName}Props\\b`, "g"),
      `: ${renamedName}Props`
    );
    return code;
  }

  /**
   * CSS 변수명에 prefix 추가하여 충돌 방지
   */
  private renameCssVariables(code: string, componentName: string): string {
    const prefix = componentName.replace(/\s+/g, "");
    // const 선언에서만 스타일 변수명 수집 (타입 이름 SerializedStyles 등 오매칭 방지)
    // Css/Styles/Classes + 선택적 _N 접미사, 또는 Css_propTrue/False (boolean 개별 변수)
    const styleVarPattern = /\bconst\s+(\w+(?:Css|Styles|Classes)(?:_\d+)?(?:_\w+(?:True|False))?)\b/g;
    const foundVars = new Set<string>();

    let match;
    while ((match = styleVarPattern.exec(code)) !== null) {
      foundVars.add(match[1]);
    }

    let renamedCode = code;
    for (const varName of foundVars) {
      const newName = `${prefix}_${varName}`;
      const regex = new RegExp(`\\b${varName}\\b`, "g");
      renamedCode = renamedCode.replace(regex, newName);
    }

    return renamedCode;
  }

  /**
   * dependency 코드의 선언 형태를 사용자 옵션에 맞춤.
   * dependency는 파일 내부 헬퍼이므로 export를 제거한다.
   */
  private convertDeclarationStyle(code: string, componentName: string): string {
    // 먼저 export 관련 키워드 제거 (dependency는 export 불필요)
    code = code.replace(/^export default \w+;?\s*$/gm, "");
    code = code.replace(/^export default\s+/gm, "");
    code = code.replace(/^export\s+(function|const)\s/gm, "$1 ");

    switch (this.declarationStyle) {
      case "arrow":
        return this.toArrowFunction(code, componentName, false);
      case "arrow-fc":
        return this.toArrowFunction(code, componentName, true);
      case "function":
      default:
        return code;
    }
  }

  private toArrowFunction(code: string, componentName: string, withFc: boolean): string {
    const funcRegex = new RegExp(
      `function\\s+${componentName}\\s*\\(([^)]*)\\)\\s*\\{`
    );
    const match = code.match(funcRegex);
    if (!match) return code;

    const params = withFc
      ? match[1].replace(/\s*:.*$/, "")   // "props: SubProps" → "props"
      : match[1];
    const typeAnnotation = withFc
      ? `const ${componentName}: React.FC<${componentName}Props> = (${params}) => {`
      : `const ${componentName} = (${params}) => {`;

    code = code.replace(funcRegex, typeAnnotation);
    code = this.replaceLastClosingBrace(code, componentName);
    return code;
  }

  /**
   * arrow function const의 마지막 closing brace를 }; 로 변경
   */
  private replaceLastClosingBrace(
    code: string,
    componentName: string
  ): string {
    let arrowStart = code.indexOf(`const ${componentName}:`);
    if (arrowStart === -1) {
      arrowStart = code.indexOf(`const ${componentName} =`);
    }
    if (arrowStart === -1) return code;

    const funcBodyStart = code.indexOf("{", code.indexOf("=>", arrowStart));
    if (funcBodyStart === -1) return code;

    let depth = 0;
    let lastBraceIdx = -1;
    let inTemplateLiteral = false;
    let inString: string | false = false;

    for (let i = funcBodyStart; i < code.length; i++) {
      const char = code[i];

      if (!inTemplateLiteral && !inString && (char === '"' || char === "'")) {
        inString = char;
        continue;
      }
      if (inString && char === inString && code[i - 1] !== "\\") {
        inString = false;
        continue;
      }
      if (inString) continue;

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
      const after = code.slice(lastBraceIdx + 1).trimStart();
      if (!after.startsWith(";")) {
        code =
          code.slice(0, lastBraceIdx + 1) +
          ";" +
          code.slice(lastBraceIdx + 1);
      }
    }

    return code;
  }

  /**
   * 분리형 export → 합체형 export default function
   */
  mergeExportDefault(code: string, componentName: string): string {
    const funcMatch = code.match(
      new RegExp(
        `(function ${componentName}\\()([\\s\\S]*?)\\n\\nexport default ${componentName};`
      )
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
   * 의존 컴포넌트의 <button> 루트를 <div>로 변환하고 interactive 속성 제거
   * HTML 규격상 <button> 내 <button> 중첩 불가 → 루트 button에 위임
   */
  private neutralizeButtonRoot(depCode: string): string {
    const returnMatch = depCode.match(/return\s*\(\s*/);
    if (!returnMatch) return depCode;

    const afterReturnIdx = returnMatch.index! + returnMatch[0].length;
    if (!depCode.slice(afterReturnIdx).startsWith("<button")) return depCode;

    let result = depCode;

    // 1. <button → <div
    result =
      result.slice(0, afterReturnIdx) +
      "<div" +
      result.slice(afterReturnIdx + "<button".length);

    // 2. Opening tag 범위 찾기 ({} 중첩 고려)
    const openTagEnd = this.findOpeningTagEnd(result, afterReturnIdx);
    if (openTagEnd === -1) return result;

    const isSelfClosing = result[openTagEnd - 1] === "/";

    // 3. Opening tag에서 onClick, disabled 속성 제거 (루트 button으로 위임)
    let openTag = result.slice(afterReturnIdx, openTagEnd + 1);
    openTag = this.removeJsxAttribute(openTag, "onClick");
    openTag = this.removeJsxAttribute(openTag, "disabled");
    result =
      result.slice(0, afterReturnIdx) + openTag + result.slice(openTagEnd + 1);

    // 4. Self-closing이면 closing tag 불필요
    if (isSelfClosing) return result;

    // 5. 마지막 </button> → </div>
    const lastClose = result.lastIndexOf("</button>");
    if (lastClose !== -1) {
      result =
        result.slice(0, lastClose) +
        "</div>" +
        result.slice(lastClose + "</button>".length);
    }

    return result;
  }

  /**
   * JSX opening tag의 닫는 > 위치를 찾기 ({} 중첩 고려)
   */
  private findOpeningTagEnd(code: string, start: number): number {
    let depth = 0;
    for (let i = start; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
      else if (code[i] === ">" && depth === 0) return i;
    }
    return -1;
  }

  /**
   * JSX opening tag 문자열에서 특정 속성 제거 ({} depth 추적)
   */
  private removeJsxAttribute(tag: string, attrName: string): string {
    const search = ` ${attrName}={`;
    const attrStart = tag.indexOf(search);
    if (attrStart === -1) return tag;

    const braceStart = attrStart + search.length - 1;
    let depth = 0;
    let i = braceStart;
    for (; i < tag.length; i++) {
      if (tag[i] === "{") depth++;
      if (tag[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }

    return tag.slice(0, attrStart) + tag.slice(i + 1);
  }

  /**
   * 같은 모듈의 import 두 줄을 병합 (default + named imports 합집합)
   */
  private mergeImportLines(a: string, b: string): string {
    const extractNamed = (line: string): string[] => {
      const match = line.match(/\{\s*([^}]+)\s*\}/);
      if (!match) return [];
      return match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    };

    const extractDefault = (line: string): string | null => {
      const match = line.match(/^import\s+(\w+)[\s,]/);
      return match && match[1] !== "type" ? match[1] : null;
    };

    const modulePath = a.match(/from\s+["']([^"']+)["']/)?.[1] ?? "";
    const isType = /^import\s+type\s/.test(a);

    const allNamed = [
      ...new Set([...extractNamed(a), ...extractNamed(b)]),
    ];
    const defaultExport = extractDefault(a) || extractDefault(b);

    const specifiers: string[] = [];
    if (defaultExport) specifiers.push(defaultExport);
    if (allNamed.length > 0) specifiers.push(`{ ${allNamed.join(", ")} }`);

    if (specifiers.length === 0) return a;

    const prefix = isType ? "import type" : "import";
    return `${prefix} ${specifiers.join(", ")} from "${modulePath}";`;
  }

  private extractCnDeclaration(code: string): string {
    const match =
      code.match(/^const cn = \([\s\S]*?\);\s*$/m) ||
      code.match(/const cn = [\s\S]*?\.join\([\s\S]*?\);/);
    return match ? match[0] : "";
  }

  private removeCnDeclaration(code: string): string {
    return code.replace(/const cn = [\s\S]*?\.join\([\s\S]*?\);\n*/g, "");
  }
}
