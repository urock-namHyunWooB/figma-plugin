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

import type { ComponentType, ConditionNode, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import { renamePropInConditions } from "../processors/utils/rewritePropConditions";

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

    // Placeholder boolean → placeholder/value/onChange string props 변환
    this.transformPlaceholderProp(ctx);

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

    const oldBoolPropName = boolProp.name;

    // 1. boolean prop 제거
    ctx.props.splice(propIndex, 1);

    // 2. string prop 추가 (같은 이름이 이미 있으면 스킵)
    if (!ctx.props.some((p) => p.name === stringPropName)) {
      ctx.props.push({
        type: "string",
        name: stringPropName,
        sourceKey: boolProp.sourceKey,
        required: false,
        defaultValue: textInfo.text,
      });
    }

    // 3. TEXT 노드에 bindings.content 설정
    if (!textInfo.textNode.bindings) {
      textInfo.textNode.bindings = {};
    }
    textInfo.textNode.bindings.content = { prop: stringPropName };

    // 4. 트리 전체에서 제거된 boolean prop → 새 string prop으로 조건 이름 갱신
    // (다른 노드가 동일한 boolean prop을 visibleCondition에서 참조할 수 있음)
    if (oldBoolPropName !== stringPropName) {
      renamePropInConditions(ctx.tree, oldBoolPropName, stringPropName);
    }

    // 5. visibleCondition 제거 (string prop이 있으면 항상 표시)
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

  // ===========================================================================
  // Placeholder → string prop 변환
  // ===========================================================================

  /**
   * semanticType === "placeholder" TEXT 노드 기반으로 input props 변환
   *
   * 트리거: placeholder TEXT 노드 존재 여부 (prop 유무와 무관)
   *
   * 변환:
   * - placeholder를 제어하는 기존 prop이 있으면 제거
   * - placeholder?: string, value?: string, onChange?: function 추가
   * - TEXT 노드에 bindings.content 설정
   */
  private transformPlaceholderProp(ctx: HeuristicContext): void {
    // 1. semanticType === "placeholder" TEXT 노드 찾기 — 없으면 스킵
    const placeholderNode = this.findNodeBySemantic(ctx.tree, "placeholder");
    if (!placeholderNode) return;

    // 2. TEXT 내용 추출 (기본값으로 사용)
    const { node: spec } = ctx.dataManager.getById(placeholderNode.id);
    const defaultText = ((spec as any)?.characters || "").trim();

    // 3. placeholder boolean/variant prop이 있으면 제거 (string으로 교체하므로)
    const propIndex = ctx.props.findIndex(
      (p) => p.name === "placeholder" && (p.type === "boolean" || p.type === "variant")
    );
    let sourceKey = "Placeholder";
    if (propIndex !== -1) {
      const removedPropName = ctx.props[propIndex].name;
      sourceKey = ctx.props[propIndex].sourceKey;
      ctx.props.splice(propIndex, 1);

      // placeholder 노드의 color를 분리: value색 → base, placeholder색 → ::placeholder
      this.splitPlaceholderColors(placeholderNode, removedPropName);

      // 제거된 prop을 참조하는 dynamic styles 정리 (compound 조건에서 해당 prop만 strip)
      this.removeDynamicStylesForProp(ctx.tree, removedPropName);
    }

    // 4. placeholder, value, onChange props 추가 (이미 있으면 스킵)
    if (!ctx.props.some((p) => p.name === "placeholder")) {
      ctx.props.push({
        type: "string",
        name: "placeholder",
        sourceKey,
        required: false,
        defaultValue: defaultText || "Placeholder",
        nativeAttribute: true,
      });
    }
    if (!ctx.props.some((p) => p.name === "value")) {
      ctx.props.push({
        type: "string",
        name: "value",
        sourceKey: "",
        required: false,
        defaultValue: "",
        nativeAttribute: true,
      });
    }
    if (!ctx.props.some((p) => p.name === "onChange")) {
      ctx.props.push({
        type: "function",
        name: "onChange",
        sourceKey: "",
        required: false,
        functionSignature: "(value: string) => void",
      });
    }

    // 5. placeholder 노드에 bindings 설정 → JsxGenerator가 <input> 태그로 렌더링
    if (!placeholderNode.bindings) {
      placeholderNode.bindings = {};
    }
    placeholderNode.bindings.content = { prop: "placeholder" };
    if (!placeholderNode.bindings.attrs) {
      placeholderNode.bindings.attrs = {};
    }
    placeholderNode.bindings.attrs.value = { prop: "value" };
    placeholderNode.bindings.attrs.onChange = { expr: "(e) => onChange?.(e.target.value)" };
  }

  /**
   * 특정 prop을 dynamic 조건에서 strip (재귀).
   * compound 조건(AND/OR)에서 해당 prop 부분만 제거하고 나머지는 보존.
   * strip 후 동일 조건으로 합쳐진 엔트리들의 style을 병합.
   */
  private removeDynamicStylesForProp(node: InternalNode, propName: string): void {
    if (node.styles?.dynamic?.length) {
      const stripped: typeof node.styles.dynamic = [];
      for (const entry of node.styles.dynamic) {
        const cond = this.stripPropFromCondition(entry.condition, propName);
        if (cond === null) continue; // 조건이 순수 해당 prop만 → 삭제
        stripped.push({ ...entry, condition: cond });
      }
      // 동일 조건 엔트리 병합 (첫 번째 값 우선)
      const mergeMap = new Map<string, (typeof stripped)[number]>();
      for (const entry of stripped) {
        const key = JSON.stringify(entry.condition);
        const existing = mergeMap.get(key);
        if (existing) {
          for (const [prop, val] of Object.entries(entry.style)) {
            if (!(prop in existing.style)) existing.style[prop] = val;
          }
        } else {
          mergeMap.set(key, { ...entry, style: { ...entry.style } });
        }
      }
      node.styles.dynamic = Array.from(mergeMap.values());
    }
    for (const child of node.children || []) {
      this.removeDynamicStylesForProp(child, propName);
    }
  }

  /**
   * condition에서 특정 prop 참조를 제거.
   * - 단일 prop 조건 → null (삭제)
   * - AND/OR 내부 → 해당 sub-condition만 제거, 나머지 보존
   * - not 래핑 → 내부 strip 후 null이면 null
   */
  private stripPropFromCondition(condition: ConditionNode, propName: string): ConditionNode | null {
    if (!condition) return null;

    // 단일 prop 참조 (eq, neq, truthy)
    if ("prop" in condition && condition.prop === propName) return null;

    // not 래핑
    if (condition.type === "not") {
      const inner = this.stripPropFromCondition(condition.condition, propName);
      return inner === null ? null : { type: "not", condition: inner };
    }

    // and/or — sub-condition 중 해당 prop만 제거
    if (condition.type === "and" || condition.type === "or") {
      const remaining = condition.conditions
        .map((c) => this.stripPropFromCondition(c, propName))
        .filter((c): c is ConditionNode => c !== null);
      if (remaining.length === 0) return null;
      if (remaining.length === 1) return remaining[0];
      return { type: condition.type, conditions: remaining };
    }

    // 해당 prop과 무관 → 그대로 유지
    return condition;
  }

  /**
   * placeholder 노드의 color를 분리:
   * - placeholder=false(value) 색 → base color
   * - placeholder=true 색 → ::placeholder pseudo
   * strip 전에 호출해야 원본 compound 조건에서 truthy/falsy 판별 가능.
   */
  private splitPlaceholderColors(node: InternalNode, propName: string): void {
    if (!node.styles?.dynamic?.length) return;

    let placeholderColor: string | null = null;
    let valueColor: string | null = null;

    for (const entry of node.styles.dynamic) {
      if (entry.style.color === undefined) continue;
      const truthy = this.isConditionTruthyForProp(entry.condition, propName);
      if (truthy === true && !placeholderColor) placeholderColor = String(entry.style.color);
      if (truthy === false && !valueColor) valueColor = String(entry.style.color);
      delete entry.style.color;
    }

    // 빈 style 엔트리 제거
    node.styles.dynamic = node.styles.dynamic.filter(
      (e) => Object.keys(e.style).length > 0
    );

    if (valueColor) {
      if (!node.styles.base) node.styles.base = {};
      node.styles.base.color = valueColor;
    }
    if (placeholderColor) {
      if (!node.styles.pseudo) node.styles.pseudo = {};
      node.styles.pseudo["::placeholder"] = { color: placeholderColor };
    }
  }

  /**
   * condition 내에서 특정 prop이 truthy 위치인지 falsy(NOT) 위치인지 판별.
   * compound AND/OR 내부를 재귀 탐색. 해당 prop이 없으면 null.
   */
  private isConditionTruthyForProp(condition: ConditionNode, propName: string): boolean | null {
    if ("prop" in condition && condition.prop === propName) {
      return condition.type === "truthy" || (condition.type === "eq" && condition.value === true);
    }
    if (condition.type === "not") {
      const inner = this.isConditionTruthyForProp(condition.condition, propName);
      return inner !== null ? !inner : null;
    }
    if (condition.type === "and" || condition.type === "or") {
      for (const sub of condition.conditions) {
        const result = this.isConditionTruthyForProp(sub, propName);
        if (result !== null) return result;
      }
    }
    return null;
  }

  /**
   * semanticType으로 노드 찾기 (재귀)
   */
  private findNodeBySemantic(
    node: InternalNode,
    semanticType: string
  ): InternalNode | null {
    if (node.semanticType === semanticType) return node;
    for (const child of node.children || []) {
      const found = this.findNodeBySemantic(child, semanticType);
      if (found) return found;
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
