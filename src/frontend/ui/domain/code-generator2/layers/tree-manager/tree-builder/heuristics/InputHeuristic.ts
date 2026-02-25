/**
 * InputHeuristic
 *
 * Input 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: input, textfield, searchbar (+10)
 * 2. Caret 패턴: "|" 문자 또는 얇은 세로 막대 (+15)
 * 3. placeholder 텍스트 (회색 텍스트) (+5)
 *
 * semanticType 설정:
 * - 루트: "input"
 * - TEXT (placeholder): "placeholder"
 * - TEXT (label): "label"
 * - INSTANCE (icon): "icon"
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class InputHeuristic implements IHeuristic {
  readonly name = "InputHeuristic";
  readonly componentType: ComponentType = "input";

  // ===========================================================================
  // Score 계산
  // ===========================================================================

  score(ctx: HeuristicContext): number {
    let score = 0;

    // 1. 이름 패턴 매칭 (+10)
    score += this.scoreByName(ctx.componentName);

    // 2. Caret 패턴 (+15)
    score += this.scoreByCaretPattern(ctx);

    // 3. placeholder 텍스트 (+5)
    score += this.scoreByPlaceholder(ctx);

    return score;
  }

  /**
   * 이름 패턴 점수
   */
  private scoreByName(name: string): number {
    if (/input/i.test(name)) return 10;
    if (/text.?field/i.test(name)) return 10;
    if (/text.?input/i.test(name)) return 10;
    if (/search.?bar/i.test(name)) return 10;
    if (/search.?field/i.test(name)) return 10;
    if (/text.?area/i.test(name)) return 10;

    return 0;
  }

  /**
   * Caret 패턴 점수
   */
  private scoreByCaretPattern(ctx: HeuristicContext): number {
    if (this.hasCaretPattern(ctx.tree, ctx)) {
      return 15;
    }
    return 0;
  }

  /**
   * placeholder 텍스트 점수
   */
  private scoreByPlaceholder(ctx: HeuristicContext): number {
    if (this.hasPlaceholderText(ctx.tree, ctx)) {
      return 5;
    }
    return 0;
  }

  /**
   * Caret 패턴 감지 (재귀)
   */
  private hasCaretPattern(node: InternalNode, ctx: HeuristicContext): boolean {
    // TEXT 노드에 "|" 문자만 있는 경우
    if (node.type === "TEXT") {
      const { node: spec } = ctx.dataManager.getById(node.id);
      const characters = ((spec as any)?.characters || "").trim();
      if (characters === "|") {
        return true;
      }
    }

    // 얇은 세로 막대 (Caret)
    if (node.type === "RECTANGLE" || node.type === "LINE") {
      const bounds = node.bounds;
      if (bounds) {
        // 폭이 1-3px이고, 높이가 폭의 5배 이상
        if (bounds.width > 0 && bounds.width <= 3 && bounds.height >= bounds.width * 5) {
          return true;
        }
      }
    }

    // 재귀 탐색
    for (const child of node.children || []) {
      if (this.hasCaretPattern(child, ctx)) {
        return true;
      }
    }

    return false;
  }

  /**
   * placeholder 텍스트 감지 (회색 텍스트)
   */
  private hasPlaceholderText(node: InternalNode, ctx: HeuristicContext): boolean {
    if (node.type === "TEXT") {
      const { node: spec } = ctx.dataManager.getById(node.id);
      const fills = (spec as any)?.fills;

      if (fills && fills[0]?.type === "SOLID" && fills[0]?.color) {
        const color = fills[0].color;
        // 회색 판별 (r ≈ g ≈ b, 0.4 < value < 0.7)
        const isGray =
          Math.abs(color.r - color.g) < 0.05 &&
          Math.abs(color.g - color.b) < 0.05 &&
          color.r > 0.4 &&
          color.r < 0.7;

        if (isGray) return true;
      }
    }

    // 재귀 탐색
    for (const child of node.children || []) {
      if (this.hasPlaceholderText(child, ctx)) {
        return true;
      }
    }

    return false;
  }

  // ===========================================================================
  // Apply
  // ===========================================================================

  apply(ctx: HeuristicContext): HeuristicResult {
    // 루트에 semanticType 설정
    ctx.tree.semanticType = "input";

    // 자식 노드 semanticType 설정
    this.applyChildSemanticTypes(ctx.tree, ctx);

    // Label/HelperText 감지 및 string prop 변환
    this.detectLabelAndHelperText(ctx);

    return {
      componentType: this.componentType,
      rootNodeType: "input",
    };
  }

  // ===========================================================================
  // Label / HelperText Detection
  // ===========================================================================

  /**
   * Label/HelperText TEXT 노드를 감지하고 boolean visibility prop을 string prop으로 변환
   *
   * 패턴:
   * - "Show Label" (BOOLEAN) → label?: string (기본값: TEXT content)
   * - "Show Guide" (BOOLEAN) → helperText?: string (기본값: TEXT content)
   *
   * 1. visibleCondition이 있는 노드 중 TEXT를 포함하는 노드 탐색
   * 2. 연결된 boolean prop을 제거하고 string prop으로 대체
   * 3. TEXT 노드에 bindings.content 설정
   */
  private detectLabelAndHelperText(ctx: HeuristicContext): void {
    // 루트 직접 자식 중에서 탐색 (Label FRAME, Characters TEXT 등)
    for (const child of ctx.tree.children || []) {
      this.processNodeForLabelHelper(child, ctx);
    }
  }

  /**
   * 노드가 label 또는 helperText 변환 대상인지 확인하고 처리
   */
  private processNodeForLabelHelper(
    node: InternalNode,
    ctx: HeuristicContext
  ): void {
    // visibleCondition이 있는 노드만 처리 (VisibilityProcessor가 설정한 것)
    if (!node.visibleCondition) return;

    // truthy condition에서 prop 이름 추출
    const condPropName = this.getConditionPropName(node.visibleCondition);
    if (!condPropName) return;

    // ctx.props에서 해당 boolean prop 찾기
    const propIndex = ctx.props.findIndex(
      (p) => p.name === condPropName && p.type === "boolean"
    );
    if (propIndex === -1) return;

    const boolProp = ctx.props[propIndex];

    // sourceKey로 label/helperText 종류 판별
    const sourceKeyLower = boolProp.sourceKey.toLowerCase();

    let stringPropName: string | undefined;
    if (/label/.test(sourceKeyLower)) {
      stringPropName = "label";
    } else if (/guide|helper|error|message/.test(sourceKeyLower)) {
      stringPropName = "helperText";
    }

    if (!stringPropName) return;

    // TEXT 노드와 텍스트 내용 찾기
    const textInfo = this.findTextContent(node, ctx);
    if (!textInfo) return;

    // 1. boolean prop 제거
    ctx.props.splice(propIndex, 1);

    // 2. string prop 추가
    ctx.props.push({
      type: "string",
      name: stringPropName,
      sourceKey: boolProp.sourceKey,
      required: false,
      defaultValue: textInfo.text,
    });

    // 3. TEXT 노드에 bindings.content 설정
    if (!textInfo.textNode.bindings) {
      textInfo.textNode.bindings = {};
    }
    textInfo.textNode.bindings.content = { prop: stringPropName };

    // 4. visibleCondition 제거 (string prop이 있으면 항상 표시)
    node.visibleCondition = undefined;
  }

  /**
   * ConditionNode에서 prop 이름 추출
   */
  private getConditionPropName(condition: any): string | null {
    if (!condition) return null;

    // { type: "truthy", prop: "showLabel" }
    if (condition.type === "truthy" && condition.prop) {
      return condition.prop;
    }

    // { type: "not", condition: { type: "truthy", prop: "..." } }
    if (condition.type === "not" && condition.condition) {
      return this.getConditionPropName(condition.condition);
    }

    return null;
  }

  /**
   * 노드에서 TEXT 콘텐츠 찾기 (자신이 TEXT이거나 자식 TEXT 탐색)
   */
  private findTextContent(
    node: InternalNode,
    ctx: HeuristicContext
  ): { textNode: InternalNode; text: string } | null {
    // 자신이 TEXT인 경우
    if (node.type === "TEXT") {
      const { node: spec } = ctx.dataManager.getById(node.id);
      const characters = ((spec as any)?.characters || "").trim();
      if (characters) {
        return { textNode: node, text: characters };
      }
    }

    // 자식에서 TEXT 찾기 (1단계만)
    for (const child of node.children || []) {
      if (child.type === "TEXT") {
        const { node: spec } = ctx.dataManager.getById(child.id);
        const characters = ((spec as any)?.characters || "").trim();
        if (characters) {
          return { textNode: child, text: characters };
        }
      }
    }

    return null;
  }

  /**
   * 자식 노드에 semanticType 설정 (재귀)
   */
  private applyChildSemanticTypes(node: InternalNode, ctx: HeuristicContext): void {
    for (const child of node.children || []) {
      this.applySemanticType(child, ctx);
      this.applyChildSemanticTypes(child, ctx);
    }
  }

  /**
   * 단일 노드에 semanticType 설정
   */
  private applySemanticType(node: InternalNode, ctx: HeuristicContext): void {
    if (node.semanticType) return;

    // 1. TEXT 노드 분류
    if (node.type === "TEXT") {
      const semantic = this.classifyTextNode(node, ctx);
      node.semanticType = semantic;
      return;
    }

    // 2. INSTANCE → icon
    if (node.type === "INSTANCE") {
      if (this.isIcon(node)) {
        node.semanticType = "icon";
        return;
      }
    }

    // 3. RECTANGLE/LINE (caret)
    if (node.type === "RECTANGLE" || node.type === "LINE") {
      const bounds = node.bounds;
      if (bounds && bounds.width <= 3 && bounds.height >= bounds.width * 5) {
        node.semanticType = "caret";
        return;
      }
    }

    // 4. input-area (FRAME with placeholder/caret)
    if (node.type === "FRAME" || node.type === "GROUP") {
      if (this.isInputArea(node, ctx)) {
        node.semanticType = "input-area";
        return;
      }
    }
  }

  /**
   * TEXT 노드 분류 (placeholder, label, helper-text)
   */
  private classifyTextNode(node: InternalNode, ctx: HeuristicContext): string {
    const { node: spec } = ctx.dataManager.getById(node.id);
    const characters = ((spec as any)?.characters || "").trim();

    // Caret
    if (characters === "|") {
      return "caret";
    }

    // 이름 패턴
    const name = node.name.toLowerCase();
    if (/placeholder|hint|guide/.test(name)) {
      return "placeholder";
    }
    if (/label/.test(name)) {
      return "label";
    }
    if (/helper|error|message/.test(name)) {
      return "helper-text";
    }

    // 색상으로 판별 (회색 → placeholder)
    const fills = (spec as any)?.fills;
    if (fills && fills[0]?.type === "SOLID" && fills[0]?.color) {
      const color = fills[0].color;
      const isGray =
        Math.abs(color.r - color.g) < 0.05 &&
        Math.abs(color.g - color.b) < 0.05 &&
        color.r > 0.4 &&
        color.r < 0.7;

      if (isGray) return "placeholder";
    }

    // 위치로 판별 (TODO: 루트 기준 y 좌표 비교)
    return "label";
  }

  /**
   * 아이콘 판별
   */
  private isIcon(node: InternalNode): boolean {
    const name = node.name.toLowerCase();
    if (/icon|icn|search|clear|close|x|eye/.test(name)) {
      return true;
    }

    const bounds = node.bounds;
    if (bounds && bounds.width <= 32 && bounds.height <= 32) {
      return true;
    }

    return false;
  }

  /**
   * input-area 판별 (placeholder 또는 caret 포함)
   */
  private isInputArea(node: InternalNode, ctx: HeuristicContext): boolean {
    for (const child of node.children || []) {
      if (child.semanticType === "placeholder" || child.semanticType === "caret") {
        return true;
      }
      if (child.type === "TEXT") {
        const { node: spec } = ctx.dataManager.getById(child.id);
        const characters = ((spec as any)?.characters || "").trim();
        if (characters === "|") return true;
      }
    }
    return false;
  }
}
