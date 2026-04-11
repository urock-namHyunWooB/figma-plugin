/**
 * StylesGenerator
 *
 * SemanticComponent의 모든 노드에서 스타일 코드 생성
 */

import type { SemanticComponent, SemanticNode } from "../../SemanticIR";
import type { IStyleStrategy, StyleResult } from "../style-strategy/IStyleStrategy";

export interface StylesGeneratorResult {
  /** 생성된 스타일 코드 */
  code: string;
  /** nodeId → styleVariableName 매핑 */
  nodeStyleMap: Map<string, string>;
}

export class StylesGenerator {
  /** 변수명 고유성 보장 (컴포넌트별 초기화) */
  private static usedNames: Map<string, number> = new Map();

  /**
   * 스타일 코드 생성 (고수준 흐름)
   *
   * 1. 변수명 추적 초기화 (컴포넌트별 독립)
   * 2. 트리 순회하며 모든 노드의 스타일 수집
   * 3. 변수명 고유성 보장 (충돌 시 _2, _3 추가)
   * 4. 빈 스타일 필터링 및 코드 조합
   */
  static generate(
    ir: SemanticComponent,
    componentName: string,
    styleStrategy: IStyleStrategy
  ): StylesGeneratorResult {
    // Step 1: 변수명 추적 초기화 (새 컴포넌트마다 리셋)
    this.usedNames.clear();

    // Step 1.5: Tailwind variant options 설정 (cva 타입 완전성 보장)
    if ("setVariantOptions" in styleStrategy) {
      const variantOptions = new Map<string, string[]>();
      for (const p of ir.props) {
        if (p.type === "variant" && (p as any).options) {
          variantOptions.set(p.name, (p as any).options);
        } else if (p.type === "boolean") {
          // boolean prop의 cva variants: true, false + extraValues
          const opts = ["true", "false"];
          if ((p as any).extraValues) opts.push(...(p as any).extraValues);
          variantOptions.set(p.name, opts);
        } else if (p.type === "slot") {
          // slot prop은 cva에서 !!slot으로 boolean 변환되어 사용됨
          variantOptions.set(p.name, ["true", "false"]);
        }
      }
      (styleStrategy as { setVariantOptions(m: Map<string, string[]>): void }).setVariantOptions(variantOptions);
    }

    // Step 1.6: Emotion boolean/slot prop 이름 설정 (개별 True/False 변수 생성용)
    if ("setBooleanNames" in styleStrategy) {
      const boolNames = new Set<string>();
      for (const p of ir.props) {
        if (p.type === "boolean" && !(p as any).extraValues?.length) {
          boolNames.add(p.name);
        }
        // slot prop도 truthy/falsy 패턴 동일
        if (p.type === "slot") {
          boolNames.add(p.name);
        }
      }
      // boolean state (예: open from useState(false))
      for (const sv of ir.state) {
        if (sv.initialValue === "false" || sv.initialValue === "true") {
          boolNames.add(sv.name);
        }
      }
      (styleStrategy as { setBooleanNames(s: Set<string>): void }).setBooleanNames(boolNames);
    }

    // Step 2: 트리 순회하며 스타일 수집
    const { styleResults, nodeStyleMap } = this.collectAllStyles(
      ir.structure,
      styleStrategy,
      ir.isDependency
    );

    // Step 3: 변수명 고유성 보장 (충돌 감지 및 카운터 추가)
    this.ensureUniqueNames(styleResults, nodeStyleMap);

    // Step 3.5: Tailwind cva 변수 추적 재구축 (리네임 후 이름 동기화)
    if ("cvaVariables" in styleStrategy) {
      const cvaSet = (styleStrategy as { cvaVariables: Set<string> }).cvaVariables;
      cvaSet.clear();
      for (const r of styleResults) {
        if (!r.isEmpty && r.code?.includes("= cva(")) {
          cvaSet.add(r.variableName);
        }
      }
    }

    // Step 3.7: 동일한 스타일 코드를 가진 변수 중복 제거
    // 같은 code를 생성하는 노드는 첫 번째 변수를 재사용
    this.deduplicateStyles(styleResults, nodeStyleMap);

    // Step 3.8: dedup 후 cva 변수 추적 재구축 (dedup으로 제거된 변수 동기화)
    if ("cvaVariables" in styleStrategy) {
      const cvaSet = (styleStrategy as { cvaVariables: Set<string> }).cvaVariables;
      cvaSet.clear();
      for (const r of styleResults) {
        if (!r.isEmpty && r.code?.includes("= cva(")) {
          cvaSet.add(r.variableName);
        }
      }
    }

    // Step 4: 빈 스타일 제거 및 코드 조합
    const nonEmptyResults = styleResults.filter((r) => !r.isEmpty && r.code);

    if (nonEmptyResults.length === 0) {
      return { code: "// No styles", nodeStyleMap };
    }

    const code = this.assembleCode(styleStrategy, nonEmptyResults);

    return { code, nodeStyleMap };
  }

  /**
   * 트리 전체 스타일 수집
   */
  private static collectAllStyles(
    root: SemanticNode,
    styleStrategy: IStyleStrategy,
    isDependency?: boolean
  ): { styleResults: StyleResult[]; nodeStyleMap: Map<string, string> } {
    const styleResults: StyleResult[] = [];
    const nodeStyleMap = new Map<string, string>();

    // dependency 컴포넌트의 root width/height를 100%로 변환
    // (slot으로 사용될 때 부모 wrapper 크기에 맞추기 위함)
    if (isDependency && root.styles) {
      this.convertRootToFluid(root);
    }

    this.collectStyles(root, styleStrategy, styleResults, nodeStyleMap, []);

    return { styleResults, nodeStyleMap };
  }

  /**
   * 동일한 스타일 코드를 가진 변수 중복 제거.
   * 같은 code를 생성하는 노드는 첫 번째 변수명을 재사용하고
   * 중복 변수는 제거한다.
   */
  private static deduplicateStyles(
    styleResults: StyleResult[],
    nodeStyleMap: Map<string, string>
  ): void {
    // code → 첫 번째 변수명 매핑
    const codeToFirstVar = new Map<string, string>();
    // 제거할 인덱스
    const removeIndices = new Set<number>();

    for (let i = 0; i < styleResults.length; i++) {
      const r = styleResults[i];
      if (r.isEmpty || !r.code) continue;

      // 변수명을 제외한 값만 비교 (const varName = VALUE → VALUE)
      const codeValue = r.code.replace(/^const \S+ = /, "");
      const existing = codeToFirstVar.get(codeValue);
      if (existing) {
        // 중복 → nodeStyleMap에서 이 변수명을 기존 변수명으로 치환
        for (const [nodeId, varName] of nodeStyleMap) {
          if (varName === r.variableName) {
            nodeStyleMap.set(nodeId, existing);
          }
        }
        removeIndices.add(i);
      } else {
        codeToFirstVar.set(codeValue, r.variableName);
      }
    }

    // 뒤에서부터 제거 (인덱스 안정성)
    for (const idx of [...removeIndices].sort((a, b) => b - a)) {
      styleResults.splice(idx, 1);
    }
  }

  /**
   * dependency root의 고정 width/height를 100%로 변환
   */
  private static convertRootToFluid(root: SemanticNode): void {
    if (!root.styles) return;

    const replaceSize = (styles: Record<string, string | number>) => {
      if (typeof styles.width === "string" && styles.width.endsWith("px")) {
        styles.width = "100%";
      }
      if (typeof styles.height === "string" && styles.height.endsWith("px")) {
        styles.height = "100%";
      }
    };

    if (root.styles.base) replaceSize(root.styles.base);
    if (root.styles.variants) {
      for (const variantMap of Object.values(root.styles.variants)) {
        for (const styles of Object.values(variantMap)) {
          replaceSize(styles);
        }
      }
    }
  }

  /**
   * 최종 코드 조합 (헬퍼 함수 + 스타일 선언)
   */
  private static assembleCode(
    styleStrategy: IStyleStrategy,
    styleResults: StyleResult[]
  ): string {
    const parts: string[] = [];

    // cn 함수 (compound 조건부 클래스 결합용)
    if ("getCnFunction" in styleStrategy) {
      const cnCode = (styleStrategy as { getCnFunction(): string }).getCnFunction();
      if (cnCode) parts.push(cnCode);
    }

    // 스타일 선언
    parts.push(...styleResults.map((r) => r.code));

    return parts.join("\n\n");
  }

  /**
   * 변수명 고유성 보장 (충돌 시 _2, _3 추가)
   */
  private static ensureUniqueNames(
    styleResults: StyleResult[],
    nodeStyleMap: Map<string, string>
  ): void {
    for (const result of styleResults) {
      if (result.isEmpty) continue;

      const originalName = result.variableName;
      const uniqueName = this.generateUniqueVarName(originalName);

      // 이름이 변경된 경우에만 업데이트
      if (uniqueName !== originalName) {
        // 1. StyleResult 업데이트
        result.variableName = uniqueName;

        // 2. nodeStyleMap 업데이트 (JsxGenerator 참조용)
        // result.nodeId를 직접 사용하여 올바른 노드의 매핑 업데이트
        if (result.nodeId) {
          nodeStyleMap.set(result.nodeId, uniqueName);
        }

        // 3. 코드 내부의 변수명 치환 (base 변수 + variant 객체명)
        result.code = this.replaceVariableName(result.code, originalName, uniqueName);
      }
    }
  }

  /**
   * 코드 내 변수명 치환 (base + variant 객체)
   * 예: btnCss → btnCss_2, btnCss_sizeStyles → btnCss_2_sizeStyles
   */
  private static replaceVariableName(
    code: string,
    oldName: string,
    newName: string
  ): string {
    const escaped = this.escapeRegex(oldName);

    // 1. 모든 _xxx 접미 패턴 치환 (variant/boolean 포함)
    //    예: btnCss_sizeStyles → btnCss_2_sizeStyles
    //    예: btnCss_disableTrue → btnCss_2_disableTrue
    code = code.replace(
      new RegExp(`\\b${escaped}(_\\w+)\\b`, "g"),
      `${newName}$1`
    );

    // 2. Base 변수명 치환
    //    예: btnCss → btnCss_2
    code = code.replace(
      new RegExp(`\\b${escaped}\\b`, "g"),
      newName
    );

    return code;
  }

  /**
   * 고유한 변수명 생성 (v1 방식)
   */
  private static generateUniqueVarName(baseName: string): string {
    const count = this.usedNames.get(baseName) || 0;
    this.usedNames.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  }

  /**
   * 정규식용 문자열 이스케이프
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 재귀적으로 스타일 수집 (부모 경로 추적)
   */
  private static collectStyles(
    node: SemanticNode,
    styleStrategy: IStyleStrategy,
    results: StyleResult[],
    nodeStyleMap: Map<string, string>,
    parentPath: string[]
  ): void {
    // slot binding 노드: children은 skip하되, 노드 자체의 스타일은 수집
    // (variant별 텍스트 color 등이 slot wrapper에 적용되어야 함)
    const slotBinding = node.content;
    if (slotBinding && "prop" in slotBinding) {
      if (node.styles) {
        const currentPath_ = [...parentPath, node.name ?? ""];
        const result = styleStrategy.generateStyle(
          node.id,
          node.name ?? "",
          node.styles,
          currentPath_
        );
        result.nodeId = node.id;
        results.push(result);
        if (!result.isEmpty) {
          nodeStyleMap.set(node.id, result.variableName);
        }
      }
      return;
    }

    // 현재 노드를 포함한 전체 경로
    const currentPath = [...parentPath, node.name ?? ""];

    // 노드에 스타일이 있으면 생성
    if (node.styles) {
      // component 타입일 때 wrapper 변수명 사용
      const isComponent = node.kind === "component";
      const nodeName = isComponent
        ? this.createWrapperName(node.name ?? "")
        : (node.name ?? "");

      const result = styleStrategy.generateStyle(
        node.id,
        nodeName,
        node.styles,
        isComponent ? [] : currentPath // component는 경로 기반 대신 이름 기반 사용
      );
      // nodeId를 StyleResult에 저장 (충돌 해결 시 사용)
      result.nodeId = node.id;
      results.push(result);

      // nodeId → variableName 매핑 저장
      if (!result.isEmpty) {
        nodeStyleMap.set(node.id, result.variableName);
      }
    }

    // component 노드의 children은 JsxGenerator가 렌더링하지 않으므로 skip
    if (node.kind === "component") {
      return;
    }

    // 자식 노드 순회 (현재 경로 전달)
    if (node.children) {
      for (const child of node.children) {
        this.collectStyles(child, styleStrategy, results, nodeStyleMap, currentPath);
      }
    }
  }

  /**
   * Component wrapper 변수명 생성
   * 예: "_Normal Responsive" → "_NormalResponsive_wrapper"
   */
  private static createWrapperName(nodeName: string): string {
    // 특수문자/공백 제거하고 PascalCase로 변환
    const cleanName = nodeName
      .replace(/^_/, "") // 앞의 언더스코어 제거
      .split(/[\s_-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("");

    return `_${cleanName}_wrapper`;
  }
}
