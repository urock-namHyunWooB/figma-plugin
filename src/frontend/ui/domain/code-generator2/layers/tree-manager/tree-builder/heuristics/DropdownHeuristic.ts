/**
 * DropdownHeuristic
 *
 * 드롭다운/셀렉트 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: dropdown, select (+20)
 *
 * 추가 기능:
 * - label, placeholder string prop 추가
 * - items 배열 prop 추가 (반복 INSTANCE → Array<{id, content}>)
 * - useState(open) 내부 상태 관리
 * - onClick 토글 핸들러
 * - states=hover → :hover (StyleProcessor가 이미 처리)
 * - states=active → open 조건부 렌더링
 * - list 1~6 개별 boolean prop 제거
 */

import type {
  ComponentType,
  InternalTree,
  InternalNode,
  ConditionNode,
  ArraySlotInfo,
  StateVar,
} from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import {
  rewritePropConditions,
  rewriteStateDynamicStyles,
  convertStateDynamicToPseudo,
} from "../processors/utils/rewritePropConditions";
import { StyleProcessor } from "../processors/StyleProcessor";

export class DropdownHeuristic implements IHeuristic {
  readonly name = "DropdownHeuristic";
  readonly componentType: ComponentType = "dropdown";

  score(ctx: HeuristicContext): number {
    if (!/dropdown|select/i.test(ctx.componentName)) return 0;
    if (!ctx.propDefs) return 0;

    // "states" VARIANT + "list" BOOLEAN이 모두 있어야 메인 드롭다운으로 인정
    // (dropdown-generic-list 등 의존 컴포넌트는 list boolean이 없어 제외)
    let hasStates = false;
    let hasListBool = false;
    for (const [key, def] of Object.entries(ctx.propDefs)) {
      if (def.type === "VARIANT" && /states/i.test(key)) hasStates = true;
      if (def.type === "BOOLEAN" && /list/i.test(key)) hasListBool = true;
    }
    return hasStates && hasListBool ? 20 : 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // 1. states variant prop 제거
    const removedStateProp = this.removeVariantProp(ctx, "states");

    // 1.5. state dynamic → pseudo 변환 (hover → :hover, active → :active)
    // 후속 단계(convertActivePseudoToOpenCondition, moveTriggerChildHoverToParent)가
    // pseudo 엔트리를 참조하므로, 먼저 state dynamic을 pseudo로 변환해야 함.
    if (removedStateProp) {
      convertStateDynamicToPseudo(ctx.tree, removedStateProp, StyleProcessor.STATE_TO_PSEUDO);
    }

    // 2. list N boolean props 제거 (props 배열에서만)
    this.removeListBooleanProps(ctx);

    // 3. Show label boolean prop 제거 + visibleCondition 해제 (노드는 유지, 항상 표시)
    this.removePropByPattern(ctx, /show\s*label/i);
    this.clearConditionByProp(ctx.tree, /showLabel/i);

    // 4. label/placeholder TEXT → string prop + bindings
    this.setupTextProps(ctx);

    // 5. list 컨테이너에 open 조건부 렌더링
    this.setListVisibility(ctx);

    // 6. :active pseudo → open 조건부 스타일
    this.convertActivePseudoToOpenCondition(ctx.tree);

    // 6.1. trigger의 open dynamic에서 list 래퍼 스타일 제거
    //       variant 병합 시 active variant의 래퍼(trigger+list) 스타일이
    //       trigger의 :active pseudo로 들어오므로 정리 필요
    this.cleanTriggerOpenDynamic(ctx.tree);

    // 6.5. trigger 자식의 분할 border → 부모 통합 (base + hover 모두)
    this.consolidateTriggerBorder(ctx.tree);

    // 6.6. :hover pseudo 정리 (레이아웃/Size 오염 제거, border → color만 유지)
    this.cleanHoverPseudo(ctx.tree);

    // 6.7. 자식의 hover border-color를 부모 trigger로 이동
    this.moveTriggerChildHoverToParent(ctx.tree);

    // 6.8. trigger hover 시 아이콘 SVG fill 변경
    this.setIconHoverFill(ctx);

    // 7. states 조건 재작성
    if (removedStateProp) {
      const conditionMap: Record<string, ConditionNode> = {
        active: { type: "truthy", prop: "open" },
        Active: { type: "truthy", prop: "open" },
      };
      // conditionMap에 없는 variant 노드 제거 (complete 등)
      this.pruneUnmappedVariantNodes(ctx.tree, removedStateProp, conditionMap);
      rewritePropConditions(ctx.tree, removedStateProp, conditionMap);
      rewriteStateDynamicStyles(ctx.tree, removedStateProp, conditionMap);
    }

    // 8. onClick 바인딩 (dropdown trigger)
    this.setClickBinding(ctx);

    // 8.5. onChange 콜백 prop 추가 (외부에서 선택 감지)
    this.ensureOnChangeProp(ctx);

    // 9. ArraySlotInfo 생성 + 개별 slot 바인딩 제거
    const arraySlots = this.createArraySlot(ctx);

    // 10. list 관련 orphan 노드 제거 (createArraySlot이 list 내부 노드 정리 후)
    this.pruneNodesByConditionProp(ctx.tree, /^list\d+$/i);

    // 11. variant merger가 만든 중복 구조 정리
    //     root 직계 자식 중 label, trigger(onClick), list, 조건부 노드만 유지
    this.pruneOrphanRootChildren(ctx.tree);

    const stateVars: StateVar[] = [
      { name: "open", setter: "setOpen", initialValue: "false" },
      { name: "selectedValue", setter: "setSelectedValue", initialValue: '""' },
    ];

    return {
      componentType: this.componentType,
      stateVars,
      arraySlots,
    };
  }

  // ─── Variant/Boolean prop 제거 ───

  private removeVariantProp(ctx: HeuristicContext, propName: string): string | null {
    const idx = ctx.props.findIndex(
      (p) => p.name.toLowerCase() === propName.toLowerCase() && p.type === "variant"
    );
    if (idx === -1) return null;
    const removed = ctx.props.splice(idx, 1)[0];
    return removed.name;
  }

  private removeListBooleanProps(ctx: HeuristicContext): void {
    // "list 1", "list 2", ... 또는 "list1", "list2" 패턴
    // SlotProcessor가 boolean → slot으로 변환했을 수 있으므로 type 체크 안 함
    for (let i = ctx.props.length - 1; i >= 0; i--) {
      const p = ctx.props[i];
      const sourceName = p.sourceKey?.split("#")[0]?.trim() ?? p.name;
      if (/^list\s*\d+$/i.test(sourceName)) {
        ctx.props.splice(i, 1);
      }
    }
  }

  private removePropByPattern(ctx: HeuristicContext, pattern: RegExp): void {
    for (let i = ctx.props.length - 1; i >= 0; i--) {
      const p = ctx.props[i];
      const sourceName = p.sourceKey?.split("#")[0]?.trim() ?? p.name;
      if (pattern.test(sourceName)) {
        ctx.props.splice(i, 1);
      }
    }
  }

  /**
   * visibleCondition만 해제 (노드 유지, 항상 표시)
   */
  private clearConditionByProp(node: InternalNode, propPattern: RegExp): void {
    if (node.visibleCondition && "prop" in node.visibleCondition) {
      if (propPattern.test(node.visibleCondition.prop)) {
        delete node.visibleCondition;
      }
    }
    for (const child of node.children || []) {
      this.clearConditionByProp(child, propPattern);
    }
  }

  /**
   * 트리에서 visibleCondition이 propPattern과 매칭되는 노드를 제거 (재귀)
   */
  private pruneNodesByConditionProp(node: InternalNode, propPattern: RegExp): void {
    if (!node.children) return;
    node.children = node.children.filter((child) => {
      if (child.visibleCondition && "prop" in child.visibleCondition) {
        if (propPattern.test(child.visibleCondition.prop)) return false;
      }
      return true;
    });
    for (const child of node.children) {
      this.pruneNodesByConditionProp(child, propPattern);
    }
  }

  /**
   * conditionMap에 없는 variant 값을 참조하는 노드를 트리에서 제거
   * (예: states=complete → rewritePropConditions가 condition 삭제 → 무조건 렌더링 방지)
   */
  private pruneUnmappedVariantNodes(
    node: InternalNode,
    removedProp: string,
    conditionMap: Record<string, ConditionNode>
  ): void {
    if (!node.children) return;
    node.children = node.children.filter((child) => {
      if (
        child.visibleCondition &&
        child.visibleCondition.type === "eq" &&
        child.visibleCondition.prop === removedProp
      ) {
        const value = child.visibleCondition.value as string;
        if (!(value in conditionMap)) return false;
      }
      return true;
    });
    for (const child of node.children) {
      this.pruneUnmappedVariantNodes(child, removedProp, conditionMap);
    }
  }

  // ─── TEXT props ───

  private setupTextProps(ctx: HeuristicContext): void {
    const labelNode = this.findTextNode(ctx.tree, "label", ctx.dataManager);
    const placeholderNode = this.findTextNode(ctx.tree, "placeholder", ctx.dataManager);

    if (labelNode) {
      this.ensureStringProp(ctx, "label", labelNode);
    }
    if (placeholderNode) {
      this.ensureStringProp(ctx, "placeholder", placeholderNode);
      // placeholder → selectedValue || placeholder (선택된 값이 있으면 그걸 표시)
      placeholderNode.bindings!.content = { expr: "selectedValue || placeholder" };
      // 선택 후 텍스트 색상: 회색(placeholder) → 검정(선택값)
      if (!placeholderNode.bindings!.style) placeholderNode.bindings!.style = {};
      placeholderNode.bindings!.style.color = {
        expr: 'selectedValue ? "var(--Color-text-03-high, #1A1A1A)" : undefined',
      };
    }
  }

  private findTextNode(
    node: InternalNode,
    textContent: string,
    dataManager: import("../../../data-manager/DataManager").default
  ): InternalNode | null {
    if (node.type === "TEXT") {
      const { node: figmaNode } = dataManager.getById(node.id);
      if ((figmaNode as any)?.characters === textContent) return node;
    }
    for (const child of node.children || []) {
      const found = this.findTextNode(child, textContent, dataManager);
      if (found) return found;
    }
    return null;
  }

  private ensureStringProp(ctx: HeuristicContext, propName: string, node: InternalNode): void {
    if (!ctx.props.some((p) => p.name === propName)) {
      ctx.props.push({
        type: "string",
        name: propName,
        defaultValue: propName,
        required: false,
        sourceKey: "",
      });
    }
    if (!node.bindings) node.bindings = {};
    node.bindings.content = { prop: propName };
  }

  // ─── List visibility ───

  private setListVisibility(ctx: HeuristicContext): void {
    const listNode = this.findListContainer(ctx.tree);
    if (listNode) {
      listNode.visibleCondition = { type: "truthy", prop: "open" };
    }
  }

  private findListContainer(node: InternalNode): InternalNode | null {
    for (const child of node.children || []) {
      if (/^list$/i.test(child.name)) return child;
    }
    // 再帰的に探索 (1レベルだけ)
    for (const child of node.children || []) {
      for (const grandchild of child.children || []) {
        if (/^list$/i.test(grandchild.name)) return grandchild;
      }
    }
    return null;
  }

  // ─── :active → open 조건부 ───

  private convertActivePseudoToOpenCondition(node: InternalNode): void {
    if (node.styles?.pseudo?.[":active"]) {
      const activeStyles = node.styles.pseudo[":active"];
      delete node.styles.pseudo[":active"];

      if (!node.styles.dynamic) node.styles.dynamic = [];
      node.styles.dynamic.push({
        condition: { type: "truthy", prop: "open" },
        style: activeStyles,
      });
    }

    for (const child of node.children || []) {
      this.convertActivePseudoToOpenCondition(child);
    }
  }

  /**
   * trigger의 open dynamic 스타일에서 list 래퍼 오염 스타일 제거.
   * variant 병합 시 active variant의 래퍼(trigger+list 감싸는 컨테이너) 스타일이
   * trigger의 :active pseudo에 들어오므로, __raw(아이콘 fill)만 유지.
   */
  private cleanTriggerOpenDynamic(root: InternalNode): void {
    const trigger = this.findTrigger(root);
    if (!trigger?.styles?.dynamic) return;

    for (const entry of trigger.styles.dynamic) {
      if (entry.condition.type === "truthy" && entry.condition.prop === "open") {
        // __raw만 보존 (icon SVG fill 변경)
        const rawValue = (entry.style as Record<string, unknown>).__raw;
        const cleaned: Record<string, string | number> = {};
        if (rawValue) {
          (cleaned as Record<string, unknown>).__raw = rawValue;
        }
        entry.style = cleaned;
      }
    }
  }

  // ─── trigger border 통합 ───

  /**
   * trigger 자식의 분할 border를 부모로 통합
   * Figma: 왼쪽(border-top/bottom/left) + 오른쪽(border-top/right/bottom)
   * CSS: 부모에 border shorthand, 자식 border 제거
   */
  private consolidateTriggerBorder(root: InternalNode): void {
    const trigger = this.findTrigger(root);
    if (!trigger || !trigger.children?.length) return;

    // 자식 base에서 border 값 추출
    let borderValue: string | null = null;
    for (const child of trigger.children) {
      const base = child.styles?.base;
      if (!base) continue;
      for (const key of Object.keys(base)) {
        if (key.startsWith("border-") && !key.includes("radius")) {
          const val = String(base[key]);
          if (val.includes("solid")) {
            borderValue = val;
            break;
          }
        }
      }
      if (borderValue) break;
    }
    if (!borderValue) return;

    // 자식 base + hover에서 border 제거, border-radius는 부모로 이동
    let borderRadius: string | null = null;
    for (const child of trigger.children) {
      if (child.styles?.base) {
        for (const key of Object.keys(child.styles.base)) {
          if (key.startsWith("border") && !key.includes("radius")) {
            delete child.styles.base[key];
          }
          if (key === "background") {
            delete child.styles.base[key];
          }
        }
        // 첫 번째 자식에서 border-radius 추출 (12px 0 0 12px → 12px)
        if (!borderRadius && child.styles.base["border-radius"]) {
          const r = String(child.styles.base["border-radius"]);
          const parts = r.split(/\s+/);
          borderRadius = parts[0]; // 첫 번째 값 사용
          delete child.styles.base["border-radius"];
        } else if (child.styles.base["border-radius"]) {
          delete child.styles.base["border-radius"];
        }
      }
      // sizeStyles의 border-radius도 제거
      if (child.styles?.dynamic) {
        for (const dyn of child.styles.dynamic) {
          for (const key of Object.keys(dyn.style)) {
            if (key.startsWith("border") && !key.includes("radius")) {
              delete dyn.style[key];
            }
            if (key === "border-radius") {
              delete dyn.style[key];
            }
          }
        }
      }
    }

    // 부모 trigger에 통합 border + border-radius 설정
    if (!trigger.styles) trigger.styles = { base: {}, dynamic: [] };
    trigger.styles.base["border"] = borderValue;
    trigger.styles.base["background"] = "var(--Color-gray-00, #fff)";
    if (borderRadius) {
      trigger.styles.base["border-radius"] = borderRadius;
    }
  }

  /**
   * trigger 자식의 :hover border-color를 부모로 이동
   * (consolidateTriggerBorder + cleanHoverPseudo 이후 실행)
   */
  private moveTriggerChildHoverToParent(root: InternalNode): void {
    const trigger = this.findTrigger(root);
    if (!trigger || !trigger.children?.length) return;

    // 자식에서 hover border-color 추출
    let hoverColor: string | null = null;
    for (const child of trigger.children) {
      const hover = child.styles?.pseudo?.[":hover"];
      if (!hover) continue;
      for (const key of Object.keys(hover)) {
        if (key.includes("border") && key.includes("color")) {
          hoverColor = String(hover[key]);
          break;
        }
      }
      if (hoverColor) break;
    }
    if (!hoverColor) return;

    // 자식 hover에서 border + background 관련 속성 모두 제거
    // (부모가 border/background를 담당하므로 자식 hover에 남으면 부모 border를 가림)
    for (const child of trigger.children) {
      const hover = child.styles?.pseudo?.[":hover"];
      if (!hover) continue;
      for (const key of Object.keys(hover)) {
        if (key.includes("border") || key === "background") delete hover[key];
      }
      if (Object.keys(hover).length === 0) {
        delete child.styles!.pseudo![":hover"];
      }
    }

    // 부모에 hover border-color 설정
    if (!trigger.styles) trigger.styles = { base: {}, dynamic: [] };
    if (!trigger.styles.pseudo) trigger.styles.pseudo = {};
    trigger.styles.pseudo[":hover"] = { "border-color": hoverColor };
  }

  /**
   * trigger hover 시 아이콘 SVG fill 변경
   * default/hover variant의 icon vectorSvg를 비교하여 hover fill 색상 추출
   */
  private setIconHoverFill(ctx: HeuristicContext): void {
    const trigger = this.findTrigger(ctx.tree);
    if (!trigger) return;

    // trigger 하위에서 icon INSTANCE 노드 찾기
    const iconInst = this.findIconInstance(trigger);
    if (!iconInst) return;

    // mergedNodes에서 variant별 icon SVG fill 추출
    const fills = new Set<string>();
    const mergedIds = iconInst.mergedNodes?.map((m) => m.id) || [iconInst.id];
    for (const mid of mergedIds) {
      const svg = ctx.dataManager.getFirstVectorSvgByInstanceId(mid);
      if (svg) {
        const match = svg.match(/fill="(#[0-9A-Fa-f]{3,8})"/);
        if (match) fills.add(match[1]);
      }
    }

    if (fills.size < 2) return; // default/hover 모두 같은 색이면 변경 불필요

    // 첫 번째 = default fill, 나머지 중 다른 것 = hover fill
    const fillArr = [...fills];
    const defaultFill = fillArr[0];
    const hoverFill = fillArr.find((f) => f !== defaultFill);
    if (!hoverFill) return;

    // trigger :hover에 svg path fill 중첩 CSS 추가
    if (!trigger.styles) trigger.styles = { base: {}, dynamic: [] };
    if (!trigger.styles.pseudo) trigger.styles.pseudo = {};
    const hover = trigger.styles.pseudo[":hover"] || {};
    hover["__raw"] = `svg path { fill: ${hoverFill}; }`;
    trigger.styles.pseudo[":hover"] = hover;

    // open(active) 상태에서도 아이콘 파란색 유지
    // 기존 open 조건 dynamic style에 __raw 병합 (first-write-wins 회피)
    if (!trigger.styles.dynamic) trigger.styles.dynamic = [];
    const openEntry = trigger.styles.dynamic.find(
      (d) => d.condition.type === "truthy" && (d.condition as any).prop === "open"
    );
    if (openEntry) {
      (openEntry.style as any).__raw = `svg path { fill: ${hoverFill}; }`;
    } else {
      trigger.styles.dynamic.push({
        condition: { type: "truthy", prop: "open" },
        style: { "__raw": `svg path { fill: ${hoverFill}; }` } as any,
      });
    }
  }

  private findIconInstance(node: InternalNode): InternalNode | null {
    if (node.type === "INSTANCE" && /icon/i.test(node.name)) return node;
    for (const child of node.children || []) {
      const found = this.findIconInstance(child);
      if (found) return found;
    }
    return null;
  }

  // ─── :hover 레이아웃 속성 제거 ───

  /** hover에서 제거할 속성 (Size variant 오염) */
  private static readonly HOVER_REMOVE_PROPS = new Set([
    "width", "height", "min-width", "min-height", "max-width", "max-height",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "gap", "flex", "flex-direction", "align-items", "justify-content",
    "align-self", "display", "border-radius",
    "font-size", "font-weight", "font-style", "font-family",
    "line-height", "letter-spacing", "color",
  ]);

  /**
   * :hover pseudo 정리
   * - 레이아웃/border-radius 속성 제거 (Size variant 오염)
   * - border shorthand → border-*-color만 유지 (색상 변경만 필요)
   */
  private cleanHoverPseudo(node: InternalNode): void {
    const hover = node.styles?.pseudo?.[":hover"];
    if (hover) {
      const additions: Record<string, string | number> = {};
      for (const key of Object.keys(hover)) {
        if (DropdownHeuristic.HOVER_REMOVE_PROPS.has(key)) {
          delete hover[key];
        } else if (key.startsWith("border-") && !key.endsWith("-color")) {
          // "border-top: 2px solid color" → "border-top-color: color"
          const val = String(hover[key]);
          const match = val.match(/solid\s+(.+)/);
          if (match) {
            additions[`${key}-color`] = match[1];
          }
          delete hover[key];
        } else if (key === "border") {
          const val = String(hover[key]);
          const match = val.match(/solid\s+(.+)/);
          if (match) {
            additions["border-color"] = match[1];
          }
          delete hover[key];
        }
      }
      Object.assign(hover, additions);
      if (Object.keys(hover).length === 0) {
        delete node.styles!.pseudo![":hover"];
      }
    }
    for (const child of node.children || []) {
      this.cleanHoverPseudo(child);
    }
  }

  // ─── onClick ───

  private setClickBinding(ctx: HeuristicContext): void {
    // dropdown trigger 찾기 (label, list가 아닌 자식)
    const trigger = this.findTrigger(ctx.tree);
    if (trigger) {
      if (!trigger.bindings) trigger.bindings = {};
      if (!trigger.bindings.attrs) trigger.bindings.attrs = {};
      trigger.bindings.attrs.onClick = { expr: "() => setOpen(!open)" };
    }
  }

  private ensureOnChangeProp(ctx: HeuristicContext): void {
    if (!ctx.props.some((p) => p.name === "onChange")) {
      ctx.props.push({
        type: "function",
        name: "onChange",
        required: false,
        sourceKey: "",
        functionSignature: "(value: string) => void",
      });
    }
  }

  private findTrigger(root: InternalNode): InternalNode | null {
    for (const child of root.children || []) {
      const lower = child.name.toLowerCase();
      if (lower !== "list" && lower !== "label") {
        return child;
      }
    }
    return null;
  }

  // ─── Array Slot ───

  private createArraySlot(ctx: HeuristicContext): ArraySlotInfo[] {
    const listNode = this.findListContainer(ctx.tree);
    if (!listNode) return [];

    // list 자식 중 INSTANCE 노드 수집
    const instances = (listNode.children || []).filter((c) => c.type === "INSTANCE");
    if (instances.length < 2) return [];

    // 기존 개별 slot 바인딩 제거
    for (const inst of instances) {
      if (inst.bindings?.content) {
        delete inst.bindings.content;
      }
      // visibility 조건도 제거 (list N boolean에 의한 것)
      if (inst.visibleCondition) {
        delete inst.visibleCondition;
      }
    }

    // TEXT 자식(Intro)의 스타일을 INSTANCE 래퍼에 합치기
    // → 의존 컴포넌트를 건너뛰고 래퍼 div에서 직접 텍스트 렌더링
    this.mergeTextStylesIntoInstances(instances);

    const arraySlot: ArraySlotInfo = {
      parentId: listNode.id,
      nodeIds: instances.map((inst) => inst.id),
      slotName: "items",
      itemProps: [
        { name: "id", type: "string" },
        { name: "content", type: "string" },
      ],
      onItemClick: "setSelectedValue(item.content); setOpen(false); onChange?.(item.content)",
    };

    return [arraySlot];
  }

  /**
   * INSTANCE 자식의 TEXT 스타일(color, font)을 INSTANCE 래퍼에 합치고
   * 자식 노드 제거 → 의존 컴포넌트 렌더링 스킵, 래퍼에서 직접 텍스트 표시
   */
  private mergeTextStylesIntoInstances(instances: InternalNode[]): void {
    const textStyleKeys = ["color", "font-family", "font-size", "font-style", "font-weight", "line-height", "letter-spacing"];

    // hover 배경 추출: background가 있는 INSTANCE = hover variant 표현
    let hoverBg: string | null = null;
    for (const inst of instances) {
      const bg = inst.styles?.base?.["background"];
      if (bg) {
        hoverBg = String(bg);
        break;
      }
    }

    for (const inst of instances) {
      // TEXT 자식 찾기
      const textChild = (inst.children || []).find((c) => c.type === "TEXT");
      if (!textChild?.styles?.base) continue;

      // TEXT 스타일을 INSTANCE base에 합치기
      if (!inst.styles) inst.styles = { base: {}, dynamic: [] };
      for (const key of textStyleKeys) {
        if (key in textChild.styles.base) {
          inst.styles.base[key] = textChild.styles.base[key];
        }
      }

      // justify-content: center → flex-start (텍스트 왼쪽 정렬)
      if (inst.styles.base["justify-content"] === "center") {
        delete inst.styles.base["justify-content"];
      }

      // hover 배경이 있으면 :hover pseudo에 추가, base에서 제거
      if (hoverBg) {
        delete inst.styles.base["background"];
        if (!inst.styles.pseudo) inst.styles.pseudo = {};
        inst.styles.pseudo[":hover"] = { background: hoverBg };
      }

      // cursor: pointer 추가 (클릭 가능 영역)
      inst.styles.base["cursor"] = "pointer";

      // 자식 제거 → INSTANCE가 leaf 노드로 변환, 의존 컴포넌트 스킵
      inst.children = [];
    }
  }

  // ─── Orphan cleanup ───

  /**
   * root 직계 자식 중 label, trigger(onClick), list, 조건부 노드만 유지
   * variant merger가 만든 중복 구조 (active/complete 전용 노드) 제거
   */
  private pruneOrphanRootChildren(root: InternalNode): void {
    if (!root.children) return;
    root.children = root.children.filter((child) => {
      const lower = child.name.toLowerCase();
      // label, list는 유지
      if (lower === "label" || lower === "list") return true;
      // onClick이 있는 trigger 유지
      if (child.bindings?.attrs?.onClick) return true;
      // visibleCondition이 있는 노드 유지 (size 조건 등)
      if (child.visibleCondition) return true;
      // 그 외는 variant 중복 → 제거
      return false;
    });
  }
}
