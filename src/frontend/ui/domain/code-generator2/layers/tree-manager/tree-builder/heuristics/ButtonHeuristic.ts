/**
 * ButtonHeuristic
 *
 * 버튼 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: button, btn, cta (+10)
 * 2. State prop에 pressed/active 있음 (+10)
 * 3. 시각적 특성: 높이 24-64px, 배경/테두리, 짧은 텍스트 (+10)
 *
 * semanticType 설정:
 * - 루트: "button"
 * - TEXT 노드: "label"
 * - INSTANCE/VECTOR (작은 크기): "icon"
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import { extractTextSlotInfo } from "../processors/utils/textSlotUtils";
import DataManager from "@code-generator2/layers/data-manager/DataManager";

export class ButtonHeuristic implements IHeuristic {
  readonly name = "ButtonHeuristic";
  readonly componentType: ComponentType = "button";

  // ===========================================================================
  // Score 계산
  // ===========================================================================

  score(ctx: HeuristicContext): number {
    let score = 0;

    // 1. 이름 패턴 매칭 (+10)
    score += this.scoreByName(ctx.componentName);

    // 2. State prop 매칭 (+10)
    score += this.scoreByStateProp(ctx.propDefs);

    // 3. 시각적 특성 매칭 (+10)
    score += this.scoreByVisual(ctx);

    return score;
  }

  /**
   * 이름 패턴 점수
   */
  private scoreByName(name: string): number {
    const lowerName = name.toLowerCase();

    // 정확한 매칭
    if (/button/i.test(name)) return 10;
    if (/^btn$/i.test(name)) return 10;
    if (/^cta$/i.test(name)) return 10;

    // 수식어 가산점
    let bonus = 0;
    if (/primary/i.test(lowerName)) bonus += 3;
    if (/secondary/i.test(lowerName)) bonus += 3;
    if (/tertiary/i.test(lowerName)) bonus += 3;

    return bonus;
  }

  /**
   * State prop 점수
   */
  private scoreByStateProp(
    propDefs:
      | Record<string, { type?: string; variantOptions?: string[] }>
      | undefined
  ): number {
    if (!propDefs) return 0;

    // State prop 찾기
    const stateProp = Object.entries(propDefs).find(
      ([key]) => key.toLowerCase() === "state"
    );

    if (!stateProp || stateProp[1].type !== "VARIANT") return 0;

    const options = stateProp[1].variantOptions || [];
    const normalizedOptions = options.map((s) => s.toLowerCase());

    // pressed/active가 있으면 버튼
    if (normalizedOptions.some((s) => s === "pressed" || s === "active")) {
      return 10;
    }

    // selected + hover + disabled 조합 → Toggle Button
    const hasSelected = normalizedOptions.some((s) => s.includes("selected"));
    const hasHover = normalizedOptions.some(
      (s) => s === "hover" || s === "hovered"
    );
    const hasDisabled = normalizedOptions.some((s) => s.includes("disabled"));

    if (hasSelected && hasHover && hasDisabled) {
      return 10;
    }

    return 0;
  }

  /**
   * 시각적 특성 점수
   */
  private scoreByVisual(ctx: HeuristicContext): number {
    const rootBounds = ctx.tree.bounds;
    if (!rootBounds) return 0;

    let score = 0;

    // 높이 24-64px
    if (rootBounds.height >= 24 && rootBounds.height <= 64) {
      score += 2;
    }

    // 가로세로 비율 1-6
    const ratio = rootBounds.width / rootBounds.height;
    if (ratio >= 1 && ratio <= 6) {
      score += 2;
    }

    // 자식 노드 확인
    const children = ctx.tree.children || [];

    // 짧은 TEXT 있음
    const hasShortText = children.some((child) => {
      if (child.type !== "TEXT") return false;
      const spec = ctx.dataManager.getById(child.id)?.node;
      const text = (spec as any)?.characters || "";
      return text.length <= 20;
    });
    if (hasShortText) score += 3;

    // INSTANCE 또는 VECTOR 있음 (아이콘)
    const hasIcon = children.some(
      (child) => child.type === "INSTANCE" || child.type === "VECTOR"
    );
    if (hasIcon) score += 3;

    return score;
  }

  // ===========================================================================
  // Apply
  // ===========================================================================

  apply(ctx: HeuristicContext): HeuristicResult {
    // 루트에 semanticType 설정
    ctx.tree.semanticType = "button";

    // 자식 노드 semanticType 설정 + TEXT slot 감지
    this.applyChildSemanticTypes(ctx.tree, ctx);

    // TEXT slot 감지 및 props 추가
    this.detectAndAddTextSlots(ctx);

    // State prop 제거 (버튼은 CSS pseudo-class로 처리)
    this.removeStateProp(ctx);

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * CSS pseudo-class로 변환 가능한 State 값 목록
   */
  private static readonly CSS_CONVERTIBLE_STATES = new Set([
    "default",
    "normal",
    "enabled",
    "rest",
    "idle",
    "hover",
    "hovered",
    "hovering",
    "active",
    "pressed",
    "pressing",
    "clicked",
    "focus",
    "focused",
    "focus-visible",
    "disabled",
    "inactive",
    "selected",
    "checked",
    "visited",
  ]);

  /**
   * State prop 제거 (CSS pseudo-class 변환 대상)
   * 버튼 컴포넌트의 State (Default/Hover/Pressed/Disabled)는
   * :hover, :active, :disabled 등으로 변환되므로 prop에서 제외
   *
   * 단, Error/Insert 등 CSS 변환 불가한 옵션이 포함된 경우 State prop 유지
   */
  private removeStateProp(ctx: HeuristicContext): void {
    const stateIndex = ctx.props.findIndex(
      (p) => p.sourceKey.toLowerCase() === "state"
    );
    if (stateIndex === -1) return;

    const stateProp = ctx.props[stateIndex];

    // variant 타입이고 options가 있으면 CSS 변환 가능 여부 확인
    if (stateProp.type === "variant" && stateProp.options && stateProp.options.length > 0) {
      const allConvertible = stateProp.options.every(
        (opt) => ButtonHeuristic.CSS_CONVERTIBLE_STATES.has(opt.toLowerCase())
      );
      // CSS 변환 불가 옵션이 있으면 State prop 유지
      if (!allConvertible) return;
    }

    ctx.props.splice(stateIndex, 1);
  }

  /**
   * 자식 노드에 semanticType 설정 (재귀)
   */
  private applyChildSemanticTypes(
    node: InternalNode,
    ctx: HeuristicContext
  ): void {
    for (const child of node.children || []) {
      this.applySemanticType(child, ctx);
      // 재귀
      this.applyChildSemanticTypes(child, ctx);
    }
  }

  /**
   * 단일 노드에 semanticType 설정
   */
  private applySemanticType(node: InternalNode, ctx: HeuristicContext): void {
    // 이미 설정되어 있으면 스킵
    if (node.semanticType) return;

    // 1. TEXT → label
    if (node.type === "TEXT") {
      node.semanticType = "label";
      return;
    }

    // 2. INSTANCE/VECTOR → icon 판별
    if (node.type === "INSTANCE" || node.type === "VECTOR") {
      if (this.isIcon(node, ctx)) {
        node.semanticType = "icon";
        return;
      }
    }

    // 3. spacer 판별 (작은 vector/rectangle)
    if (this.isSpacer(node, ctx)) {
      node.semanticType = "spacer";
      return;
    }

    // 4. icon wrapper 판별 (FRAME/GROUP with single icon child)
    if (this.isIconWrapper(node, ctx)) {
      node.semanticType = "icon-wrapper";
      return;
    }
  }

  /**
   * 아이콘 판별
   */
  private isIcon(node: InternalNode, ctx: HeuristicContext): boolean {
    // 이름 패턴
    const name = node.name.toLowerCase();
    if (/icon|icn|arrow|chevron|plus|minus|check|close|x/.test(name)) {
      return true;
    }

    // bounds로 판별 (작은 크기)
    const bounds = node.bounds;
    if (bounds && bounds.width <= 32 && bounds.height <= 32) {
      return true;
    }

    // bounds가 없으면 DataManager에서 조회
    const { node: spec } = ctx.dataManager.getById(node.id);
    const specBounds = (spec as any)?.absoluteBoundingBox;
    if (specBounds && specBounds.width <= 32 && specBounds.height <= 32) {
      return true;
    }

    return false;
  }

  /**
   * spacer 판별
   */
  private isSpacer(node: InternalNode, _ctx: HeuristicContext): boolean {
    // VECTOR, RECTANGLE, LINE만 spacer가 될 수 있음
    if (!["VECTOR", "RECTANGLE", "LINE"].includes(node.type)) {
      return false;
    }

    // 이름 패턴
    const name = node.name.toLowerCase();
    if (/spacer|min.?width|gap|divider/.test(name)) {
      return true;
    }

    // 매우 작은 크기 (한 축이 1-4px)
    const bounds = node.bounds;
    if (bounds) {
      if (bounds.width <= 4 || bounds.height <= 4) {
        return true;
      }
    }

    return false;
  }

  /**
   * icon wrapper 판별 (FRAME/GROUP with icon children only)
   */
  private isIconWrapper(node: InternalNode, ctx: HeuristicContext): boolean {
    if (node.type !== "FRAME" && node.type !== "GROUP") {
      return false;
    }

    const children = node.children || [];
    if (children.length === 0) return false;

    // 모든 자식이 icon 또는 icon이 될 수 있는 노드인지 확인
    return children.every((child) => {
      if (child.type === "INSTANCE" || child.type === "VECTOR") {
        return this.isIcon(child, ctx);
      }
      return false;
    });
  }

  // ===========================================================================
  // TEXT Slot 감지
  // ===========================================================================

  /**
   * TEXT 노드를 순회하며 slot으로 변환해야 하는 것 감지 및 props 추가
   */
  private detectAndAddTextSlots(ctx: HeuristicContext): void {
    const totalVariantCount = ctx.dataManager.totalVariantCount;

    // 모든 TEXT 노드 수집
    const textNodes: InternalNode[] = [];
    this.collectAllTextNodes(ctx.tree, textNodes);

    // 모든 TEXT 노드의 내용이 동일하고 전체 variant를 커버하면 slot 불필요
    if (
      this.shouldSkipTextSlots(textNodes, totalVariantCount, ctx.dataManager)
    ) {
      return;
    }

    // 트리 순회하며 TEXT 노드 찾기
    this.traverseAndDetectTextSlots(ctx.tree, ctx, totalVariantCount);

    // 중복 props 제거 (같은 이름의 slot props)
    this.deduplicateTextSlotProps(ctx);
  }

  /**
   * 모든 TEXT 노드 수집 (재귀)
   */
  private collectAllTextNodes(
    node: InternalNode,
    result: InternalNode[]
  ): void {
    if (node.type === "TEXT") {
      result.push(node);
    }

    for (const child of node.children || []) {
      this.collectAllTextNodes(child, result);
    }
  }

  /**
   * TEXT slot을 추가하지 않아야 하는지 판단
   *
   * 조건:
   * - 모든 TEXT 노드의 이름(name)이 동일하고
   * - 모든 TEXT 노드의 내용(characters)이 동일하고
   * - 모든 TEXT 노드가 합쳐서 전체 variant를 커버하면
   * → TEXT는 모든 variant에서 동일한 역할과 내용을 가지므로 slot 불필요
   *
   * 예:
   * - Button의 "Text" 노드가 layout 차이로 다른 위치에 있는 경우 → skip
   * - Card의 "Title"과 "Description"이 우연히 같은 내용인 경우 → skip 안함 (이름 다름)
   */
  private shouldSkipTextSlots(
    textNodes: InternalNode[],
    totalVariantCount: number,
    dataManager: DataManager
  ): boolean {
    if (textNodes.length === 0) return true;

    // 모든 TEXT 노드의 mergedNodes 개수 합산
    let totalMergedCount = 0;
    const allCharacters: string[] = [];
    const allNames: string[] = [];

    for (const node of textNodes) {
      const mergedCount = node.mergedNodes?.length || 0;
      totalMergedCount += mergedCount;

      // 각 TEXT 노드의 이름과 내용 수집
      allNames.push(node.name);

      // 각 TEXT 노드 내의 mergedNodes characters가 모두 같은지 확인
      if (node.mergedNodes && node.mergedNodes.length > 0) {
        let firstChars: string | undefined;
        let nodeAllSame = true;
        for (const merged of node.mergedNodes) {
          const { node: spec } = dataManager.getById(merged.id);
          const characters = (spec as any)?.characters || "";
          if (firstChars === undefined) {
            firstChars = characters;
          } else if (characters !== firstChars) {
            nodeAllSame = false;
            break;
          }
        }
        allCharacters.push(nodeAllSame ? "same" : "different");
      }
    }

    // 조건 1: 전체 variant를 커버하는가?
    const coversAllVariants = totalMergedCount >= totalVariantCount;

    // 조건 2: 모든 TEXT 이름이 동일한가?
    const allSameName =
      allNames.length > 0 && allNames.every((name) => name === allNames[0]);

    // 조건 3: 각 TEXT 노드의 mergedNodes 내에서 내용이 동일한가?
    const allSameContent =
      allCharacters.length > 0 &&
      allCharacters.every((c) => c === "same");

    return coversAllVariants && allSameName && allSameContent;
  }

  /**
   * 중복된 TEXT slot props 제거
   *
   * 같은 이름의 TEXT slot이 여러 개 있을 경우 (예: 아이콘 유무에 따라 다른 위치의 Text 노드),
   * 첫 번째 것만 유지하고 나머지는 제거
   */
  private deduplicateTextSlotProps(ctx: HeuristicContext): void {
    const seenTextSlots = new Set<string>();
    const filteredProps: typeof ctx.props = [];

    for (const prop of ctx.props) {
      // TEXT slot (sourceKey가 빈 문자열인 slot)만 중복 체크
      if (prop.type === "slot" && prop.sourceKey === "") {
        if (seenTextSlots.has(prop.name)) {
          // 중복된 TEXT slot은 스킵
          continue;
        }
        seenTextSlots.add(prop.name);
      }

      filteredProps.push(prop);
    }

    // ctx.props 배열 교체
    ctx.props.length = 0;
    ctx.props.push(...filteredProps);
  }

  /**
   * 재귀적으로 TEXT 노드 탐색 및 slot 변환
   */
  private traverseAndDetectTextSlots(
    node: InternalNode,
    ctx: HeuristicContext,
    totalVariantCount: number
  ): void {
    // TEXT 노드인 경우 slot 판별
    if (node.type === "TEXT") {
      const slotInfo = extractTextSlotInfo(
        node,
        totalVariantCount,
        ctx.dataManager
      );

      if (slotInfo) {
        // TEXT slot prop 추가 (텍스트만 들어가므로 string 타입)
        ctx.props.push({
          type: "string",
          name: slotInfo.propName,
          defaultValue: slotInfo.defaultValue,
          required: false,
          sourceKey: "", // TEXT slot은 Figma prop이 아님
        });

        // 노드에 binding 추가
        if (!node.bindings) {
          node.bindings = {};
        }
        node.bindings.content = { prop: slotInfo.propName };
      }
    }

    // 자식 노드 재귀 탐색
    for (const child of node.children || []) {
      this.traverseAndDetectTextSlots(child, ctx, totalVariantCount);
    }
  }
}
