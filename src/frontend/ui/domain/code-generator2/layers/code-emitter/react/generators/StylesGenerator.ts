/**
 * StylesGenerator
 *
 * UITree의 모든 노드에서 스타일 코드 생성
 */

import type { UITree, UINode } from "../../../../types/types";
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
    uiTree: UITree,
    componentName: string,
    styleStrategy: IStyleStrategy
  ): StylesGeneratorResult {
    // Step 1: 변수명 추적 초기화 (새 컴포넌트마다 리셋)
    this.usedNames.clear();

    // Step 2: 트리 순회하며 스타일 수집
    const { styleResults, nodeStyleMap } = this.collectAllStyles(
      uiTree.root,
      styleStrategy
    );

    // Step 3: 변수명 고유성 보장 (충돌 감지 및 카운터 추가)
    this.ensureUniqueNames(styleResults, nodeStyleMap);

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
    root: UINode,
    styleStrategy: IStyleStrategy
  ): { styleResults: StyleResult[]; nodeStyleMap: Map<string, string> } {
    const styleResults: StyleResult[] = [];
    const nodeStyleMap = new Map<string, string>();

    this.collectStyles(root, styleStrategy, styleResults, nodeStyleMap, []);

    return { styleResults, nodeStyleMap };
  }

  /**
   * 최종 코드 조합 (헬퍼 함수 + 스타일 선언)
   */
  private static assembleCode(
    styleStrategy: IStyleStrategy,
    styleResults: StyleResult[]
  ): string {
    const parts: string[] = [];

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

    // 1. Variant 객체명 치환: oldName_xxxStyles → newName_xxxStyles
    //    예: btnCss_sizeStyles → btnCss_2_sizeStyles
    code = code.replace(
      new RegExp(`\\b${escaped}(_\\w+Styles)\\b`, "g"),
      `${newName}$1`
    );

    // 2. Base 변수명 치환: oldName → newName
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
    node: UINode,
    styleStrategy: IStyleStrategy,
    results: StyleResult[],
    nodeStyleMap: Map<string, string>,
    parentPath: string[]
  ): void {
    // slot binding이 있으면 노드 자체와 children 스타일 수집 모두 skip
    // (JsxGenerator가 slot binding 시 {propName}으로 대체하므로 스타일 불필요)
    const slotBinding = node.bindings?.content;
    if (slotBinding && "prop" in slotBinding) {
      return;
    }

    // 현재 노드를 포함한 전체 경로
    const currentPath = [...parentPath, node.name];

    // 노드에 스타일이 있으면 생성
    if (node.styles) {
      // component 타입일 때 wrapper 변수명 사용
      const isComponent = node.type === "component";
      const nodeName = isComponent
        ? this.createWrapperName(node.name)
        : node.name;

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
    if (node.type === "component") {
      return;
    }

    // 자식 노드 순회 (현재 경로 전달)
    if ("children" in node && node.children) {
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
