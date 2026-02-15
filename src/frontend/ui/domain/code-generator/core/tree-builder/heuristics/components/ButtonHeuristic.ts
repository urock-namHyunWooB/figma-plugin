/**
 * ButtonHeuristic
 *
 * 버튼 컴포넌트 휴리스틱 (Composition 패턴).
 *
 * GenericHeuristic 상속 대신 각 Processor를 직접 호출하여
 * 버튼 특화 처리를 명확하게 수행합니다.
 *
 * 판별 기준 (canProcess):
 * 1. 이름 패턴: button, btn, cta
 * 2. State prop에 Pressed/Active가 있음
 * 3. State prop에 Selected + Hover + Disabled 조합이 있음 (Toggle/Select Button)
 * 4. 시각적 특성:
 *    - 사각형 형태 (직사각형/정사각형)
 *    - 적절한 크기 (높이 24~64px)
 *    - 배경색 또는 테두리 존재
 *    - 짧은 텍스트(1~4단어) 또는 아이콘 포함
 *    - 콘텐츠 중앙 정렬
 *
 * 버튼 특화 처리:
 * - 아이콘(INSTANCE/VECTOR)의 fill 색상을 CSS color로 변환
 * - State에 따른 아이콘 색상 변화 지원
 */

import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType, PropDefinition } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";
import type { IComponentHeuristic } from "./IComponentHeuristic";
import type { InternalNode } from "../../workers/interfaces";

// Processors (Composition)
import { VariantProcessor } from "../../workers/VariantProcessor";
import { CleanupProcessor } from "../../workers/CleanupProcessor";
import { PropsProcessor } from "../../workers/PropsProcessor";
import { NodeProcessor } from "../../workers/NodeProcessor";
import { VisibilityProcessor } from "../../workers/VisibilityProcessor";
import { StyleProcessor } from "../../workers/StyleProcessor";
import { InstanceProcessor } from "../../workers/InstanceProcessor";
import { SlotProcessor } from "../../workers/SlotProcessor";
import { NodeConverter } from "../../workers/NodeConverter";
import { traverseTree } from "../../workers/utils/treeUtils";

export class ButtonHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "button";
  readonly name = "ButtonHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  // ===========================================================================
  // State Mapping (버튼용)
  // ===========================================================================

  private readonly stateMapping: Record<string, PseudoClass | null> = {
    hover: ":hover",
    hovered: ":hover",
    active: ":active",
    pressed: ":active",
    focus: ":focus",
    focused: ":focus",
    disabled: ":disabled",
    default: null,
    normal: null,
  };

  stateToPseudo(state: string): PseudoClass | null | undefined {
    const normalized = state.toLowerCase();
    if (normalized in this.stateMapping) {
      return this.stateMapping[normalized];
    }
    return undefined;
  }

  // ===========================================================================
  // 컴포넌트 판별
  // ===========================================================================

  /**
   * Button 컴포넌트 매칭 점수 계산
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;
    const doc = ctx.data.document as any;

    // 이름 패턴 매칭
    if (/button/i.test(name)) score += 10;
    if (/^btn$/i.test(name)) score += 10;
    if (/^cta$/i.test(name)) score += 10;

    // 버튼 수식어 가산점
    if (/primary/i.test(name)) score += 3;
    if (/secondary/i.test(name)) score += 3;
    if (/tertiary/i.test(name)) score += 3;

    // State prop 기반 매칭
    const stateOptions = this.getStateVariantOptions(ctx);
    if (stateOptions.length > 0) {
      const normalizedOptions = stateOptions.map((s) => s.toLowerCase());

      // Pressed/Active가 있으면 버튼 (버튼 고유 특징)
      if (normalizedOptions.some((s) => s === "pressed" || s === "active")) {
        score += 10;
      }

      // Selected + Hover + Disabled 조합 → Toggle/Select Button
      const hasSelected = normalizedOptions.some((s) => s.includes("selected"));
      const hasHover = normalizedOptions.some(
        (s) => s === "hover" || s === "hovered"
      );
      const hasDisabled = normalizedOptions.some((s) => s.includes("disabled"));

      if (hasSelected && hasHover && hasDisabled) {
        score += 10;
      }
    }

    // 시각적 특성 기반 점수 (최대 +10)
    score += this.calculateVisualScore(doc);

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= ButtonHeuristic.MATCH_THRESHOLD;
  }

  // ===========================================================================
  // 메인 파이프라인 (Composition - 직접 호출)
  // ===========================================================================

  process(ctx: BuildContext): BuildContext {
    let result = ctx;

    // Phase 1: 구조 생성
    result = VariantProcessor.merge(result);
    result = CleanupProcessor.removeInstanceInternalNodes(result);
    result = PropsProcessor.extract(result);

    // Phase 2: 분석
    result = NodeProcessor.detectSemanticRoles(result);
    result = VisibilityProcessor.processHidden(result);

    // Phase 3: 노드 변환
    result = NodeProcessor.mapTypes(result);
    result = this.processButtonStyles(result);  // 버튼 전용 (스타일 빌드 + 아이콘 색상)
    result = StyleProcessor.applyPositions(result);
    result = StyleProcessor.handleRotation(result);
    result = InstanceProcessor.buildExternalRefs(result);
    result = this.processButtonVisibility(result);  // 버튼 전용 (항상 숨겨진 노드 제외)
    result = PropsProcessor.bindProps(result);
    result = this.processButtonSlots(result);  // 버튼 전용 (slot 타입 변경)

    // Phase 3.5: prop 타입이 확정된 후 스타일 분리
    result = StyleProcessor.separateByProp(result);

    // Phase 4: 최종 조립
    result = NodeConverter.assemble(result);

    return result;
  }

  // ===========================================================================
  // 버튼 전용 처리
  // ===========================================================================

  /**
   * 버튼 스타일 처리
   *
   * 1. 기본 스타일 빌드
   * 2. 아이콘의 fill 색상을 루트 노드의 CSS color로 추가
   */
  private processButtonStyles(ctx: BuildContext): BuildContext {
    // 1. 기본 스타일 처리
    let result = StyleProcessor.build(ctx);

    // 2. 아이콘 fill 색상을 CSS color로 변환
    // (separateByProp는 slot 타입이 확정된 후 process()에서 호출)
    result = this.addIconColorStyles(result);

    return result;
  }

  /**
   * 버튼 슬롯 처리
   *
   * 버튼의 경우 모든 variant에서 동일한 텍스트여도 `text` prop으로 노출해야 함.
   */
  private processButtonSlots(ctx: BuildContext): BuildContext {
    // 1. 기본 slot 처리
    let result = ctx;
    result = SlotProcessor.detectTextSlots(result);
    result = SlotProcessor.detectSlots(result);
    result = SlotProcessor.detectArraySlots(result);
    result = SlotProcessor.enrichArraySlotsWithComponentNames(result);

    // 2. 버튼 TEXT 노드 강제 text prop 추가
    if (!result.internalTree || !result.propsMap) return result;

    const textNode = this.findPrimaryTextNode(result.internalTree);
    if (!textNode) return result;

    const propsMap = new Map(result.propsMap);
    const nodePropBindings = new Map(result.nodePropBindings || new Map());

    // text prop이 이미 있으면 건너뛰기
    const hasTextProp = Array.from(propsMap.values()).some(
      (p) => p.name === "text" || p.name.toLowerCase() === "text"
    );
    if (hasTextProp) return result;

    // text prop 추가
    const defaultText = this.getTextContent(textNode, result.data);
    const textProp: PropDefinition = {
      name: "text",
      type: "string",
      defaultValue: defaultText || "Button",
      required: false,
    };
    propsMap.set("text", textProp);

    // prop binding 추가
    const existingBindings = nodePropBindings.get(textNode.id) || {};
    nodePropBindings.set(textNode.id, {
      ...existingBindings,
      characters: "text",
    });

    return { ...result, propsMap, nodePropBindings };
  }

  /**
   * 버튼 visibility 처리
   *
   * visible=false인 노드는 showXxx prop으로 제어됨.
   * VisibilityProcessor.resolve에서 조건부 렌더링 설정.
   */
  private processButtonVisibility(ctx: BuildContext): BuildContext {
    return VisibilityProcessor.resolve(ctx);
  }

  // ===========================================================================
  // 아이콘 색상 처리
  // ===========================================================================

  /**
   * 아이콘(INSTANCE/VECTOR)의 fill 색상을 루트 노드의 CSS color로 추가
   */
  private addIconColorStyles(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.nodeStyles) return ctx;

    // 아이콘 노드 찾기 (INSTANCE 또는 VECTOR)
    const iconNode = this.findIconNode(ctx.internalTree);
    if (!iconNode || iconNode.mergedNode.length === 0) return ctx;

    // 각 variant별 fill 색상 추출
    const variantColors = this.extractVariantFillColors(iconNode, ctx);
    if (variantColors.size === 0) return ctx;

    // 모든 variant의 색상이 같으면 base에 추가, 다르면 dynamic에 추가
    const uniqueColors = new Set(variantColors.values());
    const rootId = ctx.internalTree.id;
    const rootStyles = ctx.nodeStyles.get(rootId) || { base: {}, dynamic: [] };

    const newNodeStyles = new Map(ctx.nodeStyles);

    if (uniqueColors.size === 1) {
      // 단일 색상 → base에 추가
      const color = [...uniqueColors][0];
      newNodeStyles.set(rootId, {
        ...rootStyles,
        base: { ...rootStyles.base, color },
      });
    } else {
      // State별 색상 맵 생성
      const stateColorMap = new Map<string, string>();
      for (const [variantName, color] of variantColors) {
        const stateMatch = variantName.match(/State=([^,]+)/i);
        if (stateMatch) {
          const state = stateMatch[1].trim();
          stateColorMap.set(state, color);
        }
      }

      // State를 pseudo-class/base/dynamic으로 분류
      const newDynamic = [...(rootStyles.dynamic || [])];
      const newPseudo = { ...(rootStyles.pseudo || {}) };
      let newBase = { ...rootStyles.base };
      const processedStates = new Set<string>();

      // Default 색상은 base에 추가
      const defaultColor =
        stateColorMap.get("Default") || stateColorMap.get("default");
      if (defaultColor) {
        newBase = { ...newBase, color: defaultColor };
      }

      // 기존 dynamic 업데이트
      for (let i = 0; i < newDynamic.length; i++) {
        const stateInCondition = this.extractStateFromCondition(
          newDynamic[i].condition
        );
        if (stateInCondition && stateColorMap.has(stateInCondition)) {
          const color = stateColorMap.get(stateInCondition)!;
          newDynamic[i] = {
            ...newDynamic[i],
            style: { ...newDynamic[i].style, color },
          };
          processedStates.add(stateInCondition);
        }
      }

      // 기존 dynamic에 없는 State 처리
      for (const [state, color] of stateColorMap) {
        if (processedStates.has(state)) continue;

        const lowerState = state.toLowerCase();
        if (lowerState === "default" || lowerState === "normal") continue;

        const pseudoClass = this.stateToPseudo(state);
        if (pseudoClass) {
          newPseudo[pseudoClass] = { ...(newPseudo[pseudoClass] || {}), color };
        } else {
          const condition = this.createStateCondition(state);
          if (condition) {
            newDynamic.push({ condition, style: { color } });
          }
        }
      }

      newNodeStyles.set(rootId, {
        ...rootStyles,
        base: newBase,
        dynamic: newDynamic,
        ...(Object.keys(newPseudo).length > 0 ? { pseudo: newPseudo } : {}),
      });
    }

    return { ...ctx, nodeStyles: newNodeStyles };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private getStateVariantOptions(ctx: BuildContext): string[] {
    const doc = ctx.data.document as {
      componentPropertyDefinitions?: Record<
        string,
        { type?: string; variantOptions?: string[] }
      >;
    };

    const propDefs = doc.componentPropertyDefinitions;
    if (!propDefs) return [];

    for (const [key, def] of Object.entries(propDefs)) {
      if (key.toLowerCase() === "state" && def.type === "VARIANT") {
        return def.variantOptions || [];
      }
    }

    return [];
  }

  private calculateVisualScore(doc: any): number {
    const firstVariant = this.getFirstVariant(doc);
    if (!firstVariant) return 0;

    let visualScore = 0;

    if (this.hasProperHeight(firstVariant)) visualScore += 2;
    if (this.hasProperAspectRatio(firstVariant)) visualScore += 2;
    if (this.hasFillOrBorder(firstVariant)) visualScore += 3;
    if (this.hasShortTextOrIcon(firstVariant)) visualScore += 2;
    if (this.isCenterAligned(firstVariant)) visualScore += 1;

    return visualScore;
  }

  private getFirstVariant(doc: any): any {
    if (doc.type === "COMPONENT_SET" && doc.children?.length > 0) {
      return doc.children[0];
    }
    if (doc.type === "COMPONENT") return doc;
    return doc;
  }

  private hasProperHeight(doc: any): boolean {
    const height = doc.absoluteBoundingBox?.height;
    return height >= 24 && height <= 64;
  }

  private hasProperAspectRatio(doc: any): boolean {
    const box = doc.absoluteBoundingBox;
    if (!box?.width || !box?.height) return false;
    const ratio = box.width / box.height;
    return ratio >= 1 && ratio <= 6;
  }

  private hasFillOrBorder(doc: any): boolean {
    const fills = doc.fills;
    if (fills?.some((f: any) => f.visible !== false && f.type === "SOLID")) {
      return true;
    }
    const strokes = doc.strokes;
    if (strokes?.some((s: any) => s.visible !== false)) return true;
    return false;
  }

  private hasShortTextOrIcon(variant: any): boolean {
    const children = variant.children;
    if (!children) return false;

    let hasShortText = false;
    let hasIcon = false;

    const checkNode = (node: any): void => {
      if (node.type === "TEXT") {
        const text = node.characters || "";
        const wordCount = text.trim().split(/\s+/).length;
        if (wordCount <= 4 || text.length <= 20) hasShortText = true;
      }
      if (node.type === "INSTANCE" || node.type === "VECTOR") {
        const box = node.absoluteBoundingBox;
        if (box?.width <= 32 && box?.height <= 32) hasIcon = true;
      }
      if (node.children) {
        for (const child of node.children) checkNode(child);
      }
    };

    for (const child of children) checkNode(child);
    return hasShortText || hasIcon;
  }

  private isCenterAligned(doc: any): boolean {
    if (doc.layoutMode === "HORIZONTAL" || doc.layoutMode === "VERTICAL") {
      return doc.primaryAxisAlignItems === "CENTER" || doc.counterAxisAlignItems === "CENTER";
    }
    return false;
  }

  private findPrimaryTextNode(root: InternalNode): InternalNode | null {
    let textNode: InternalNode | null = null;

    traverseTree(root, (node) => {
      if (textNode) return;
      if (node.type === "TEXT" && node.id !== root.id) {
        if (node.parent?.type !== "INSTANCE" && node.parent?.type !== "VECTOR") {
          textNode = node;
        }
      }
    });

    return textNode;
  }

  private getTextContent(textNode: InternalNode, data: any): string | null {
    if (textNode.mergedNode.length === 0) return null;
    const nodeSpec = data.getNodeById(textNode.mergedNode[0].id);
    if (nodeSpec && "characters" in nodeSpec) {
      return nodeSpec.characters;
    }
    return null;
  }

  private findIconNode(root: InternalNode): InternalNode | null {
    let iconNode: InternalNode | null = null;

    traverseTree(root, (node) => {
      if (iconNode) return;
      if ((node.type === "INSTANCE" || node.type === "VECTOR") && node.id !== root.id) {
        iconNode = node;
      }
    });

    return iconNode;
  }

  private extractVariantFillColors(
    iconNode: InternalNode,
    ctx: BuildContext
  ): Map<string, string> {
    const variantColors = new Map<string, string>();

    for (const merged of iconNode.mergedNode) {
      const variantName = merged.variantName;
      if (!variantName) continue;

      const nodeSpec = ctx.data.getNodeById(merged.id);
      if (!nodeSpec) continue;

      const fills = this.getFillsFromNode(nodeSpec, ctx);
      const color = this.extractColorFromFills(fills);

      if (color) {
        variantColors.set(variantName, color);
      }
    }

    return variantColors;
  }

  private getFillsFromNode(node: any, _ctx: BuildContext): any[] {
    if (node.fills?.length > 0) return node.fills;
    if (node.type === "INSTANCE" && node.children) {
      for (const child of node.children) {
        if (child.fills?.length > 0) return child.fills;
      }
    }
    return [];
  }

  private extractColorFromFills(fills: any[]): string | null {
    if (!fills?.length) return null;
    const fill = fills[0];
    if (fill.type !== "SOLID" || !fill.color) return null;

    const { r, g, b } = fill.color;
    const toHex = (n: number) =>
      Math.round(n * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  private extractStateFromCondition(condition: any): string | null {
    if (!condition) return null;
    if (condition.type === "BinaryExpression") {
      if (condition.left?.property?.name === "state") {
        return condition.right?.value;
      }
    }
    if (condition.type === "LogicalExpression") {
      return (
        this.extractStateFromCondition(condition.left) ||
        this.extractStateFromCondition(condition.right)
      );
    }
    return null;
  }

  private createStateCondition(state: string): any {
    return {
      type: "BinaryExpression",
      operator: "===",
      left: {
        type: "MemberExpression",
        object: { name: "props" },
        property: { name: "state" },
      },
      right: {
        type: "Literal",
        value: state,
      },
    };
  }
}
