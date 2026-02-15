/**
 * InputHeuristic
 *
 * Input 컴포넌트 휴리스틱 (Composition 패턴).
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: input, textfield, searchbar 등
 * - Caret 패턴: "|" 문자 또는 얇은 세로 막대
 *
 * Input 특화 처리:
 * - Placeholder 텍스트 감지 (회색 텍스트 → 실제 값 텍스트 패턴)
 * - leftIcon, rightIcon, clearButton slot 감지
 */

import type { PseudoClass } from "@code-generator/types/customType";
import type {
  ComponentType,
  PreparedDesignData,
  SlotDefinition,
} from "@code-generator/types/architecture";
import type { BuildContext, SemanticTypeEntry } from "../../workers/BuildContext";
import type { IComponentHeuristic } from "./IComponentHeuristic";
import type { InternalNode } from "../../workers/interfaces/core";

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
import { toCamelCase } from "../../workers/utils/stringUtils";

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface VariantColorInfo {
  variantName: string;
  color: RGB | null;
  characters: string;
}

/** 내부용 placeholder 감지 결과 */
interface PlaceholderDetectionResult {
  nodeId: string;
  placeholderText: string;
  linkedPropName: string;
}

export class InputHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "input";
  readonly name = "InputHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /**
   * Placeholder 관련 키워드
   * 이 키워드를 포함하는 prop 이름만 placeholder로 인식
   */
  private static readonly PLACEHOLDER_KEYWORDS = [
    "guide",
    "placeholder",
    "hint",
    "helper",
  ];

  // ===========================================================================
  // State Mapping
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
   * Input 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - input, textfield, textinput: +10
   * - searchbar, searchfield: +10
   * - Caret 패턴 (구조): +15
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    // 이름 패턴 점수
    if (/input/i.test(name)) score += 10;
    if (/textfield/i.test(name)) score += 10;
    if (/text.?field/i.test(name)) score += 10;
    if (/text.?input/i.test(name)) score += 10;
    if (/search.?bar/i.test(name)) score += 10;
    if (/search.?field/i.test(name)) score += 10;

    // 구조 패턴 점수 (Caret)
    if (this.hasCaretPattern(ctx)) score += 15;

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= InputHeuristic.MATCH_THRESHOLD;
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
    result = this.detectPlaceholders(result);  // Input 특화

    // Phase 3: 노드 변환
    result = NodeProcessor.mapTypes(result);
    result = StyleProcessor.build(result);
    result = StyleProcessor.applyPositions(result);
    result = StyleProcessor.handleRotation(result);
    result = InstanceProcessor.buildExternalRefs(result);
    result = VisibilityProcessor.resolve(result);
    result = PropsProcessor.bindProps(result);
    result = SlotProcessor.detectTextSlots(result);
    result = SlotProcessor.detectSlots(result);
    result = SlotProcessor.detectArraySlots(result);
    result = SlotProcessor.enrichArraySlotsWithComponentNames(result);
    result = this.detectInputSlots(result);  // Input 특화

    // Phase 4: 최종 조립
    result = NodeConverter.assemble(result);

    return result;
  }

  // ===========================================================================
  // Input 특화 처리 - Caret 패턴 감지
  // ===========================================================================

  /**
   * Caret(커서) 패턴 감지
   *
   * Input 컴포넌트의 디자인 특성:
   * - TEXT 노드에 "|" 문자만 있음 (커서 표현)
   * - 또는 얇은 세로 RECTANGLE (width 1-3px, height가 더 큼)
   */
  private hasCaretPattern(ctx: BuildContext): boolean {
    if (!ctx.internalTree) return false;

    let found = false;

    traverseTree(ctx.internalTree, (node) => {
      if (found) return;

      // 1. TEXT 노드에 "|" 문자만 있는 경우
      if (node.type === "TEXT") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const characters = spec?.characters?.trim();
        if (characters === "|") {
          found = true;
          return;
        }
      }

      // 2. 얇은 세로 RECTANGLE (Caret 막대)
      if (node.type === "RECTANGLE" || node.type === "LINE") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const width = spec?.absoluteBoundingBox?.width ?? spec?.size?.x ?? 0;
        const height = spec?.absoluteBoundingBox?.height ?? spec?.size?.y ?? 0;

        // 폭이 1-3px이고, 높이가 폭의 5배 이상이면 Caret
        if (width > 0 && width <= 3 && height >= width * 5) {
          found = true;
          return;
        }
      }
    });

    return found;
  }

  // ===========================================================================
  // Input 특화 처리 - Placeholder 감지
  // ===========================================================================

  /**
   * 분석 단계 (테스트용 public 메서드)
   *
   * 기본 분석 + Input 특화 분석 (placeholder 감지)
   */
  processAnalysis(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = NodeProcessor.detectSemanticRoles(result);
    result = VisibilityProcessor.processHidden(result);
    result = this.detectPlaceholders(result);
    return result;
  }

  /**
   * placeholder 감지 처리
   */
  private detectPlaceholders(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) return ctx;

    const nodeSemanticTypes = new Map<string, SemanticTypeEntry>(ctx.nodeSemanticTypes);
    const excludePropsFromStyles = new Set<string>(ctx.excludePropsFromStyles);

    traverseTree(ctx.internalTree, (node) => {
      if (node.type !== "TEXT") return;

      const result = this.detectPlaceholder(node, ctx);
      if (result) {
        // 노드에 semanticType 설정
        nodeSemanticTypes.set(result.nodeId, {
          type: "textInput",
          placeholder: result.placeholderText,
        });

        // placeholder 관련 prop은 스타일 조건에서 제외
        if (result.linkedPropName) {
          excludePropsFromStyles.add(result.linkedPropName);
        }
      }
    });

    return {
      ...ctx,
      nodeSemanticTypes,
      excludePropsFromStyles,
    };
  }

  /**
   * TEXT 노드에서 placeholder 패턴 감지
   */
  private detectPlaceholder(
    node: InternalNode,
    ctx: BuildContext
  ): PlaceholderDetectionResult | null {
    // mergedNode가 2개 이상이어야 variant 비교 가능
    if (node.mergedNode.length < 2) return null;

    // 1. mergedNode에서 variant별 색상/텍스트 수집
    const variantInfos = this.collectVariantInfos(node, ctx.data);

    // 2. 회색 variant 찾기
    const grayVariant = variantInfos.find(
      (v) => v.color && this.isGrayColor(v.color)
    );
    if (!grayVariant) return null;

    // 3. 다른 variant에서 검정색인지 확인 (placeholder가 아닌 실제 값)
    const blackVariant = variantInfos.find(
      (v) =>
        v.variantName !== grayVariant.variantName &&
        v.color &&
        this.isBlackColor(v.color)
    );
    if (!blackVariant) return null;

    // 4. 연관된 variant prop 찾기 (variantName에서 추출)
    const linkedPropName = this.findLinkedProp(grayVariant.variantName);

    // 5. linkedPropName이 placeholder 관련 키워드를 포함하는지 확인
    // 이 조건이 없으면 disabled 상태의 회색 텍스트도 placeholder로 인식됨
    if (!this.isPlaceholderRelatedProp(linkedPropName)) {
      return null;
    }

    return {
      nodeId: node.id,
      placeholderText: grayVariant.characters,
      linkedPropName,
    };
  }

  /**
   * prop 이름이 placeholder 관련 키워드를 포함하는지 확인
   */
  private isPlaceholderRelatedProp(propName: string): boolean {
    if (!propName) return false;
    const lowerPropName = propName.toLowerCase();
    return InputHeuristic.PLACEHOLDER_KEYWORDS.some((keyword) =>
      lowerPropName.includes(keyword)
    );
  }

  /**
   * mergedNode에서 각 variant의 색상과 텍스트 정보 수집
   */
  private collectVariantInfos(
    node: InternalNode,
    data: PreparedDesignData
  ): VariantColorInfo[] {
    return node.mergedNode.map((merged) => {
      const spec = data.getNodeById(merged.id);
      const fills = (spec as any)?.fills;
      const characters = (spec as any)?.characters || "";

      let color: RGB | null = null;
      if (fills && fills[0]?.type === "SOLID" && fills[0]?.color) {
        color = fills[0].color;
      }

      return {
        variantName: merged.variantName || "",
        color,
        characters,
      };
    });
  }

  /**
   * variantName에서 연관된 prop 이름 추출
   *
   * "State=Normal, Guide Text=True" -> "guideText" (True인 prop)
   */
  private findLinkedProp(variantName: string): string {
    // variantName 파싱: "State=Normal, Guide Text=True"
    const pairs = variantName.split(",").map((s) => s.trim());

    for (const pair of pairs) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      // True 값을 가진 prop이 placeholder를 제어하는 prop
      if (value === "True" || value === "true") {
        // "Guide Text" -> "guideText"
        return toCamelCase(key);
      }
    }

    return "";
  }

  /**
   * 색상이 회색인지 판단
   */
  private isGrayColor(color: RGB): boolean {
    const isMonochrome =
      Math.abs(color.r - color.g) < 0.05 && Math.abs(color.g - color.b) < 0.05;
    const isMidTone = color.r > 0.4 && color.r < 0.7;
    return isMonochrome && isMidTone;
  }

  /**
   * 색상이 검정색인지 판단
   */
  private isBlackColor(color: RGB): boolean {
    return color.r < 0.1 && color.g < 0.1 && color.b < 0.1;
  }

  // ===========================================================================
  // Input 특화 처리 - Slot 감지
  // ===========================================================================

  /**
   * Input 특화 slot 감지
   */
  private detectInputSlots(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) return ctx;

    const slots: SlotDefinition[] = [...ctx.slots];
    const existingSlotNodeIds = new Set(slots.map((s) => s.targetNodeId));

    traverseTree(ctx.internalTree, (node) => {
      // 이미 slot으로 등록된 노드는 skip
      if (existingSlotNodeIds.has(node.id)) return;

      // INSTANCE 노드만 처리
      if (node.type !== "INSTANCE") return;

      const nodeName = node.name;

      // leftIcon 감지: left/prefix/leading + icon
      if (this.isLeftIconPattern(nodeName)) {
        slots.push({ name: "leftIcon", targetNodeId: node.id });
        existingSlotNodeIds.add(node.id);
        return;
      }

      // rightIcon 감지: right/suffix/trailing + icon
      if (this.isRightIconPattern(nodeName)) {
        slots.push({ name: "rightIcon", targetNodeId: node.id });
        existingSlotNodeIds.add(node.id);
        return;
      }

      // clearButton 감지: clear/close/x/cancel
      if (this.isClearButtonPattern(nodeName)) {
        slots.push({ name: "clearButton", targetNodeId: node.id });
        existingSlotNodeIds.add(node.id);
        return;
      }
    });

    return { ...ctx, slots };
  }

  /**
   * leftIcon 패턴 매칭
   */
  private isLeftIconPattern(name: string): boolean {
    return /^(left|prefix|leading)[\s_-]*(icon|icn)/i.test(name);
  }

  /**
   * rightIcon 패턴 매칭
   */
  private isRightIconPattern(name: string): boolean {
    return /^(right|suffix|trailing)[\s_-]*(icon|icn)/i.test(name);
  }

  /**
   * clearButton 패턴 매칭
   */
  private isClearButtonPattern(name: string): boolean {
    return /^(clear|close|x|cancel)[\s_-]*(button|btn|icon|icn)?$/i.test(name);
  }
}
