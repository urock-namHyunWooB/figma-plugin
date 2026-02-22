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
  PropDefinition,
  PropStyleGroup,
  StyleDefinition,
} from "@code-generator/types/architecture";
import type {
  BuildContext,
  SemanticTypeEntry,
} from "../../workers/BuildContext";
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

/** Label/HelperText 감지 결과 */
interface LabelHelperTextResult {
  labelNodeId?: string;
  labelText?: string;
  labelY?: number;
  helperTextNodeId?: string;
  helperTextText?: string;
  helperTextY?: number;
}

/** Error 상태 감지 결과 */
interface ErrorStateResult {
  hasError: boolean;
  errorVariantNames: string[];
  /** 노드별 error 상태 스타일 (nodeId → { true: 스타일, false: 스타일 }) */
  errorStyles: Map<
    string,
    {
      true: Record<string, string | number>;
      false: Record<string, string | number>;
    }
  >;
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

  /**
   * State 문자열을 CSS pseudo-class로 변환
   * @param state - State 문자열 (예: "hover", "focus")
   * @returns 대응하는 pseudo-class 또는 null/undefined
   */
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
   *
   * @param ctx - 빌드 컨텍스트
   * @returns 매칭 점수 (0 이상)
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

  /**
   * 이 휴리스틱이 해당 컴포넌트를 처리할 수 있는지 판별
   * @param ctx - 빌드 컨텍스트
   * @returns 처리 가능 여부
   */
  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= InputHeuristic.MATCH_THRESHOLD;
  }

  // ===========================================================================
  // 메인 파이프라인 (Composition - 직접 호출)
  // ===========================================================================

  /**
   * 전체 파이프라인 실행
   * @param ctx - 빌드 컨텍스트
   * @returns 처리된 BuildContext
   */
  process(ctx: BuildContext): BuildContext {
    let result = ctx;

    // Phase 1: 구조 생성
    result = VariantProcessor.merge(result);
    result = CleanupProcessor.removeInstanceInternalNodes(result);
    result = PropsProcessor.extract(result);

    // Phase 3: 노드 변환
    result = NodeProcessor.mapTypes(result);
    result = StyleProcessor.build(result);
    result = StyleProcessor.applyPositions(result);
    result = StyleProcessor.handleRotation(result);
    result = InstanceProcessor.buildExternalRefs(result);

    result = PropsProcessor.bindProps(result);

    result = this.detectPlaceholders(result); // Input 특화: Placeholder 감지 (slot 변환 전에 실행)
    // Input 특화: Label/HelperText 감지 (VisibilityProcessor.resolve 전에 실행해야 조건이 설정되지 않음)
    result = this.detectLabelAndHelperText(result);

    result = this.detectInputSlots(result); // Input 특화
    // Input 특화: Error 상태 감지 및 boolean prop 생성
    result = this.detectErrorState(result);

    //TODO input 태그로 렌더링 되어야함

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
   *
   * @param ctx - 빌드 컨텍스트
   * @returns Caret 패턴 존재 여부
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
   *
   * @param ctx - 빌드 컨텍스트
   * @returns 분석이 완료된 BuildContext
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
   *
   * placeholder 텍스트를 감지하여:
   * 1. nodeSemanticTypes에 textInput 타입 설정 (slot 변환 방지)
   * 2. propsMap에 placeholder string prop 추가
   * 3. nodePropBindings에 characters 바인딩 설정
   *
   * @param ctx - 빌드 컨텍스트
   * @returns placeholder가 감지된 BuildContext
   */
  private detectPlaceholders(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) return ctx;

    const nodeSemanticTypes = new Map<string, SemanticTypeEntry>(
      ctx.nodeSemanticTypes
    );
    const excludePropsFromStyles = new Set<string>(ctx.excludePropsFromStyles);
    const propsMap = new Map(ctx.propsMap);
    const nodePropBindings = new Map(ctx.nodePropBindings);

    traverseTree(ctx.internalTree, (node) => {
      if (node.type !== "TEXT") return;

      const result = this.detectPlaceholder(node, ctx);
      if (result) {
        // 노드에 semanticType 설정 (slot 변환 방지용)
        nodeSemanticTypes.set(result.nodeId, {
          type: "textInput",
          placeholder: result.placeholderText,
        });

        // placeholder 관련 prop은 스타일 조건에서 제외
        if (result.linkedPropName) {
          excludePropsFromStyles.add(result.linkedPropName);
        }

        // placeholder string prop 생성 (slot 대신 string으로)
        if (!propsMap.has("placeholder")) {
          propsMap.set("placeholder", {
            name: "placeholder",
            type: "string",
            defaultValue: result.placeholderText,
            required: false,
          } as PropDefinition);
        }

        // TEXT 노드에 바인딩 설정
        nodePropBindings.set(result.nodeId, {
          characters: "placeholder",
        });
      }
    });

    return {
      ...ctx,
      nodeSemanticTypes,
      excludePropsFromStyles,
      propsMap,
      nodePropBindings,
    };
  }

  /**
   * TEXT 노드에서 placeholder 패턴 감지
   * @param node - TEXT InternalNode
   * @param ctx - 빌드 컨텍스트
   * @returns placeholder 감지 결과 또는 null
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

    // 5. placeholder 관련 확인:
    // - linkedPropName이 placeholder 키워드 포함 (guide, placeholder, hint, helper)
    // - 또는 노드 이름이 input/placeholder 관련 키워드 포함
    // 이 조건이 없으면 disabled 상태의 회색 텍스트도 placeholder로 인식됨
    const isPlaceholderByProp = this.isPlaceholderRelatedProp(linkedPropName);
    const isPlaceholderByNodeName = this.isInputRelatedNodeName(node.name);
    if (!isPlaceholderByProp && !isPlaceholderByNodeName) {
      return null;
    }

    return {
      nodeId: node.id,
      placeholderText: grayVariant.characters,
      linkedPropName,
    };
  }

  /**
   * 노드 이름이 input/placeholder 관련인지 확인
   * @param nodeName - 노드 이름
   * @returns input/placeholder 관련 여부
   */
  private isInputRelatedNodeName(nodeName: string): boolean {
    if (!nodeName) return false;
    const lowerName = nodeName.toLowerCase();
    return (
      lowerName.includes("input") ||
      lowerName.includes("placeholder") ||
      lowerName.includes("text field") ||
      lowerName.includes("textfield")
    );
  }

  /**
   * prop 이름이 placeholder 관련 키워드를 포함하는지 확인
   * @param propName - prop 이름
   * @returns placeholder 관련 키워드 포함 여부
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
   * @param node - InternalNode
   * @param data - PreparedDesignData
   * @returns variant별 색상/텍스트 정보 배열
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
   *
   * @param variantName - variant 이름 문자열
   * @returns camelCase로 변환된 prop 이름
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
   * @param color - RGB 색상 객체
   * @returns 회색 여부
   */
  private isGrayColor(color: RGB): boolean {
    const isMonochrome =
      Math.abs(color.r - color.g) < 0.05 && Math.abs(color.g - color.b) < 0.05;
    const isMidTone = color.r > 0.4 && color.r < 0.7;
    return isMonochrome && isMidTone;
  }

  /**
   * 색상이 검정색인지 판단
   * @param color - RGB 색상 객체
   * @returns 검정색 여부
   */
  private isBlackColor(color: RGB): boolean {
    return color.r < 0.1 && color.g < 0.1 && color.b < 0.1;
  }

  // ===========================================================================
  // Input 특화 처리 - Slot 감지
  // ===========================================================================

  /**
   * Input 특화 slot 감지
   * @param ctx - 빌드 컨텍스트
   * @returns 슬롯이 감지된 BuildContext
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
   * @param name - 노드 이름
   * @returns leftIcon 패턴 일치 여부
   */
  private isLeftIconPattern(name: string): boolean {
    return /^(left|prefix|leading)[\s_-]*(icon|icn)/i.test(name);
  }

  /**
   * rightIcon 패턴 매칭
   * @param name - 노드 이름
   * @returns rightIcon 패턴 일치 여부
   */
  private isRightIconPattern(name: string): boolean {
    return /^(right|suffix|trailing)[\s_-]*(icon|icn)/i.test(name);
  }

  /**
   * clearButton 패턴 매칭
   * @param name - 노드 이름
   * @returns clearButton 패턴 일치 여부
   */
  private isClearButtonPattern(name: string): boolean {
    return /^(clear|close|x|cancel)[\s_-]*(button|btn|icon|icn)?$/i.test(name);
  }

  // ===========================================================================
  // Input 특화 처리 - Label/HelperText 감지
  // ===========================================================================

  /**
   * Label 및 HelperText 감지
   *
   * Input 영역(Caret/Placeholder가 있는 영역) 기준:
   * - 위에 있는 TEXT → label (string prop)
   * - 아래에 있는 TEXT → helperText (string prop)
   *
   * 기존 관련 prop 제거:
   * - visible 바인딩이 있으면 해당 boolean prop 제거 (showLabel 등)
   * - characters 바인딩이 있으면 해당 text prop 제거 (labelText 등)
   * - 부모 노드의 visible 바인딩도 확인
   *
   * @param ctx - 빌드 컨텍스트
   * @returns label/helperText가 감지된 BuildContext
   */
  private detectLabelAndHelperText(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) return ctx;

    // 1. Input 영역의 y 좌표 찾기
    const inputAreaY = this.findInputAreaY(ctx);
    if (inputAreaY === null) return ctx;

    // 2. Input 영역의 하단 y 좌표 찾기
    const inputAreaBottomY = this.findInputAreaBottomY(ctx);

    // 3. 루트 레벨 TEXT 노드에서 label/helperText 감지
    const detection = this.detectLabelHelperTextNodes(
      ctx,
      inputAreaY,
      inputAreaBottomY
    );
    if (!detection.labelNodeId && !detection.helperTextNodeId) return ctx;

    // 4. Props 처리
    const propsMap = new Map(ctx.propsMap);
    const nodePropBindings = new Map(ctx.nodePropBindings);

    if (detection.labelNodeId && detection.labelText) {
      // 기존 관련 prop 제거
      this.removeRelatedProps(detection.labelNodeId, ctx, propsMap);

      // 이름 충돌 시 다른 이름 사용
      const labelPropName = propsMap.has("label") ? "inputLabel" : "label";

      // label prop 생성
      propsMap.set(labelPropName, {
        name: labelPropName,
        type: "string",
        defaultValue: detection.labelText,
        required: false,
        nodeId: detection.labelNodeId, // TEXT 노드 바인딩용
      } as PropDefinition);

      nodePropBindings.set(detection.labelNodeId, {
        characters: labelPropName,
      });
    }

    if (detection.helperTextNodeId && detection.helperTextText) {
      // 기존 관련 prop 제거
      this.removeRelatedProps(detection.helperTextNodeId, ctx, propsMap);

      // 이름 충돌 시 다른 이름 사용
      const helperTextPropName = propsMap.has("helperText")
        ? "inputHelperText"
        : "helperText";

      // helperText prop 생성
      propsMap.set(helperTextPropName, {
        name: helperTextPropName,
        type: "string",
        defaultValue: detection.helperTextText,
        required: false,
        nodeId: detection.helperTextNodeId, // TEXT 노드 바인딩용
      } as PropDefinition);
      nodePropBindings.set(detection.helperTextNodeId, {
        characters: helperTextPropName,
      });
    }

    return { ...ctx, propsMap, nodePropBindings };
  }

  /**
   * TEXT 노드와 관련된 기존 prop들을 제거
   *
   * - visible 바인딩 → 해당 boolean prop 제거
   * - 부모 노드의 visible 바인딩도 확인
   *
   * PropsProcessor.bindProps 이전에 실행되므로 ctx.data.getNodeById를 사용
   *
   * @param nodeId - TEXT 노드 ID
   * @param ctx - 빌드 컨텍스트
   * @param propsMap - props 맵 (직접 수정됨)
   */
  private removeRelatedProps(
    nodeId: string,
    ctx: BuildContext,
    propsMap: Map<string, PropDefinition>
  ): void {
    const node = this.findNodeById(ctx.internalTree!, nodeId);

    // 1. 해당 노드의 visible 바인딩 확인 (Figma 노드 스펙에서 직접 조회)
    const nodeSpec = ctx.data.getNodeById(nodeId) as any;
    const visibleRef = nodeSpec?.componentPropertyReferences?.visible;
    if (visibleRef) {
      // originalKey로 prop 찾아서 제거
      const propName = this.findPropByOriginalKey(propsMap, visibleRef);
      if (propName) {
        propsMap.delete(propName);
      }
    }

    // 2. nodePropBindings에서 해당 노드의 바인딩 확인
    const existingBindings = ctx.nodePropBindings?.get(nodeId);
    if (existingBindings) {
      // visible 바인딩이 있으면 해당 prop 제거
      if (existingBindings.visible && propsMap.has(existingBindings.visible)) {
        propsMap.delete(existingBindings.visible);
      }
      // characters 바인딩이 있으면 해당 prop 제거 (다른 이름으로 대체될 것이므로)
      if (existingBindings.characters && propsMap.has(existingBindings.characters)) {
        propsMap.delete(existingBindings.characters);
      }
    }

    // 3. 부모 노드의 visible 바인딩 확인 (TEXT가 FRAME 안에 감싸진 경우)
    if (node?.parent) {
      const parentSpec = ctx.data.getNodeById(node.parent.id) as any;
      const parentVisibleRef = parentSpec?.componentPropertyReferences?.visible;
      if (parentVisibleRef) {
        // originalKey로 prop 찾아서 제거
        const propName = this.findPropByOriginalKey(propsMap, parentVisibleRef);
        if (propName) {
          propsMap.delete(propName);
        }
      }
    }
  }

  /**
   * originalKey로 prop 찾기
   * @param propsMap - props 맵
   * @param originalKey - 검색할 originalKey
   * @returns prop 이름 또는 null
   */
  private findPropByOriginalKey(
    propsMap: Map<string, PropDefinition>,
    originalKey: string
  ): string | null {
    for (const [name, def] of propsMap.entries()) {
      if (def.originalKey === originalKey) {
        return name;
      }
    }
    return null;
  }

  /**
   * InternalTree에서 노드 ID로 노드 찾기
   * @param root - 루트 InternalNode
   * @param targetId - 찾을 노드 ID
   * @returns 찾은 노드 또는 null
   */
  private findNodeById(
    root: InternalNode,
    targetId: string
  ): InternalNode | null {
    if (root.id === targetId) return root;
    for (const child of root.children) {
      const found = this.findNodeById(child, targetId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Input 영역의 y 좌표 찾기
   *
   * 감지 기준 (우선순위):
   * 1. Caret("|") 텍스트
   * 2. semanticType이 textInput인 노드
   * 3. "Placeholder" 텍스트 또는 노드 이름
   * 4. "Input" 이름을 가진 FRAME 노드
   *
   * @param ctx - 빌드 컨텍스트
   * @returns Input 영역의 y 좌표 또는 null
   */
  private findInputAreaY(ctx: BuildContext): number | null {
    if (!ctx.internalTree) return null;

    let inputAreaY: number | null = null;

    traverseTree(ctx.internalTree, (node) => {
      if (inputAreaY !== null) return;

      // 1. Caret 패턴 확인 ("|" 텍스트)
      if (node.type === "TEXT") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const characters = spec?.characters?.trim();
        if (characters === "|") {
          const y = spec?.absoluteBoundingBox?.y;
          if (y !== undefined) {
            inputAreaY = y;
            return;
          }
        }
      }

      // 2. Placeholder로 감지된 노드 확인
      const semanticType = ctx.nodeSemanticTypes?.get(node.id);
      if (semanticType?.type === "textInput") {
        const spec = ctx.data.getNodeById(node.id);
        const y = spec?.absoluteBoundingBox?.y;
        if (y !== undefined) {
          inputAreaY = y;
          return;
        }
      }

      // 3. "Placeholder" 텍스트 또는 노드 이름 패턴
      if (node.type === "TEXT") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const characters = spec?.characters?.trim()?.toLowerCase();
        const nodeName = node.name?.toLowerCase() ?? "";

        if (
          characters === "placeholder" ||
          nodeName.includes("placeholder") ||
          nodeName.includes("input")
        ) {
          const y = spec?.absoluteBoundingBox?.y;
          if (y !== undefined) {
            inputAreaY = y;
            return;
          }
        }
      }

      // 4. "Input" 이름을 가진 FRAME 노드
      if (node.type === "FRAME" && node.name && /input/i.test(node.name)) {
        const spec = ctx.data.getNodeById(node.id);
        const y = spec?.absoluteBoundingBox?.y;
        if (y !== undefined) {
          inputAreaY = y;
          return;
        }
      }
    });

    return inputAreaY;
  }

  /**
   * Input 영역의 하단 y 좌표 찾기
   * @param ctx - 빌드 컨텍스트
   * @returns Input 영역의 하단 y 좌표 또는 null
   */
  private findInputAreaBottomY(ctx: BuildContext): number | null {
    if (!ctx.internalTree) return null;

    let inputAreaBottomY: number | null = null;

    traverseTree(ctx.internalTree, (node) => {
      if (inputAreaBottomY !== null) return;

      // 1. Caret ("|" 텍스트)
      if (node.type === "TEXT") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const characters = spec?.characters?.trim();
        if (characters === "|") {
          if (node.parent) {
            const parentSpec = ctx.data.getNodeById(node.parent.id);
            const bounds = parentSpec?.absoluteBoundingBox;
            if (bounds) {
              inputAreaBottomY = bounds.y + bounds.height;
            }
          }
          return;
        }
      }

      // 2. textInput semantic type
      const semanticType = ctx.nodeSemanticTypes?.get(node.id);
      if (semanticType?.type === "textInput" && node.parent) {
        const parentSpec = ctx.data.getNodeById(node.parent.id);
        const bounds = parentSpec?.absoluteBoundingBox;
        if (bounds) {
          inputAreaBottomY = bounds.y + bounds.height;
        }
        return;
      }

      // 3. "Placeholder" 텍스트 또는 노드 이름 패턴
      if (node.type === "TEXT") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const characters = spec?.characters?.trim()?.toLowerCase();
        const nodeName = node.name?.toLowerCase() ?? "";

        if (
          characters === "placeholder" ||
          nodeName.includes("placeholder") ||
          nodeName.includes("input")
        ) {
          if (node.parent) {
            const parentSpec = ctx.data.getNodeById(node.parent.id);
            const bounds = parentSpec?.absoluteBoundingBox;
            if (bounds) {
              inputAreaBottomY = bounds.y + bounds.height;
            }
          }
          return;
        }
      }

      // 4. "Input" 이름을 가진 FRAME 노드
      if (node.type === "FRAME" && node.name && /input/i.test(node.name)) {
        const spec = ctx.data.getNodeById(node.id);
        const bounds = spec?.absoluteBoundingBox;
        if (bounds) {
          inputAreaBottomY = bounds.y + bounds.height;
        }
      }
    });

    return inputAreaBottomY;
  }

  /**
   * Label/HelperText TEXT 노드 감지
   *
   * 이미 바인딩된 노드도 감지하여 label/helperText로 변환합니다.
   * (기존 showLabel, labelText 등의 prop은 제거되고 label로 통합됨)
   *
   * 감지 범위:
   * - 루트 직계 자식 TEXT
   * - 루트 직계 자식 FRAME/GROUP 안의 TEXT (1단계 중첩)
   *
   * @param ctx - 빌드 컨텍스트
   * @param inputAreaY - Input 영역의 y 좌표
   * @param inputAreaBottomY - Input 영역의 하단 y 좌표
   * @returns label/helperText 감지 결과
   */
  private detectLabelHelperTextNodes(
    ctx: BuildContext,
    inputAreaY: number,
    inputAreaBottomY: number | null
  ): LabelHelperTextResult {
    const result: LabelHelperTextResult = {};

    const rootChildren = ctx.internalTree?.children || [];

    // TEXT 노드 후보 수집 (직계 자식 + 1단계 중첩)
    const textCandidates: InternalNode[] = [];

    for (const child of rootChildren) {
      if (child.type === "TEXT") {
        textCandidates.push(child);
      } else if (child.type === "FRAME" || child.type === "GROUP") {
        // FRAME/GROUP 안의 TEXT도 확인 (1단계 중첩)
        for (const grandChild of child.children || []) {
          if (grandChild.type === "TEXT") {
            textCandidates.push(grandChild);
          }
        }
      }
    }

    for (const textNode of textCandidates) {
      // placeholder로 감지된 노드는 제외
      const semanticType = ctx.nodeSemanticTypes?.get(textNode.id);
      if (semanticType?.type === "textInput") continue;

      const spec = ctx.data.getNodeById(textNode.id);
      if (!spec?.absoluteBoundingBox) continue;

      const nodeY = spec.absoluteBoundingBox.y;
      const characters = (spec as any).characters || "";

      if (nodeY < inputAreaY) {
        // Input 위 → label (가장 가까운 것 = y값이 큰 것)
        if (!result.labelNodeId || nodeY > result.labelY!) {
          result.labelNodeId = textNode.id;
          result.labelText = characters;
          result.labelY = nodeY;
        }
      } else if (inputAreaBottomY !== null && nodeY > inputAreaBottomY) {
        // Input 아래 → helperText (가장 가까운 것 = y값이 작은 것)
        if (!result.helperTextNodeId || nodeY < result.helperTextY!) {
          result.helperTextNodeId = textNode.id;
          result.helperTextText = characters;
          result.helperTextY = nodeY;
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // Input 특화 처리 - Error 상태 감지
  // ===========================================================================

  /**
   * Error 상태 감지
   *
   * 빨간색이 사용된 variant를 찾아 error boolean prop 생성
   * Status variant에서 해당 값 제거
   *
   * @param ctx - 빌드 컨텍스트
   * @returns error 상태가 감지된 BuildContext
   */
  private detectErrorState(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.propsMap) return ctx;

    // 1. Error variant 감지 (빨간색 기반)
    const errorResult = this.findErrorVariants(ctx);
    if (!errorResult.hasError) return ctx;

    // 2. error boolean prop 생성
    const propsMap = new Map(ctx.propsMap);
    propsMap.set("error", {
      name: "error",
      type: "boolean",
      defaultValue: false,
      required: false,
    } as PropDefinition);

    // 3. Status variant에서 Error 옵션 제거
    const statusProp = this.findStatusProp(propsMap);
    if (statusProp?.options) {
      const filteredOptions = statusProp.options.filter(
        (opt: string) => !this.isErrorVariantValue(opt)
      );
      if (filteredOptions.length !== statusProp.options.length) {
        // options는 PropDefinition 타입에 선언적으로 없지만 런타임에 존재
        const updatedProp = { ...statusProp, options: filteredOptions } as any;
        propsMap.set(statusProp.name, updatedProp);
      }
    }

    // 4. error prop 스타일을 nodeStyles.propStyles에 추가
    const nodeStyles = this.applyErrorPropStyles(ctx, errorResult);

    // 5. excludePropsFromStyles에 Status 추가 (Error 관련 스타일 분리됨)
    const excludePropsFromStyles = new Set(ctx.excludePropsFromStyles || []);
    // Status variant 값 중 error 관련 값들을 스타일에서 제외
    for (const variantName of errorResult.errorVariantNames) {
      excludePropsFromStyles.add(variantName);
    }

    return { ...ctx, propsMap, nodeStyles, excludePropsFromStyles };
  }

  /**
   * Error variant 찾기 (빨간색 기반)
   * @param ctx - 빌드 컨텍스트
   * @returns Error 상태 감지 결과
   */
  private findErrorVariants(ctx: BuildContext): ErrorStateResult {
    const result: ErrorStateResult = {
      hasError: false,
      errorVariantNames: [],
      errorStyles: new Map(),
    };

    if (!ctx.internalTree) return result;

    // mergedNode에서 빨간색 요소가 있는 variant 찾기
    traverseTree(ctx.internalTree, (node) => {
      for (const merged of node.mergedNode) {
        const variantName = merged.variantName || "";

        // 이미 Error variant로 식별된 경우 스킵
        const isErrorVariant =
          this.isErrorVariantByName(variantName) ||
          result.errorVariantNames.some((ev) => variantName.includes(ev));

        // 빨간색 감지
        const hasRedColor = this.hasRedColorInNode(merged.id, ctx.data);

        if (hasRedColor) {
          result.hasError = true;

          // Status=Error 패턴에서 Error 값 추출
          const errorValue = this.extractErrorValueFromVariantName(variantName);
          if (errorValue && !result.errorVariantNames.includes(errorValue)) {
            result.errorVariantNames.push(errorValue);
          }

          // 노드별 error 스타일 수집
          const styleTree = ctx.data.getStyleById(merged.id);
          if (styleTree?.cssStyle) {
            const existing = result.errorStyles.get(node.id) || {
              true: {},
              false: {},
            };
            existing.true = { ...existing.true, ...styleTree.cssStyle };
            result.errorStyles.set(node.id, existing);
          }
        } else if (!isErrorVariant) {
          // Error가 아닌 variant의 스타일 (error=false 스타일)
          const styleTree = ctx.data.getStyleById(merged.id);
          if (styleTree?.cssStyle && result.errorStyles.has(node.id)) {
            const existing = result.errorStyles.get(node.id)!;
            // 첫 번째 non-error variant의 스타일만 사용
            if (Object.keys(existing.false).length === 0) {
              existing.false = { ...styleTree.cssStyle };
            }
          }
        }
      }
    });

    return result;
  }

  /**
   * 노드에 빨간색이 있는지 확인
   * @param nodeId - 노드 ID
   * @param data - PreparedDesignData
   * @returns 빨간색 존재 여부
   */
  private hasRedColorInNode(nodeId: string, data: PreparedDesignData): boolean {
    const spec = data.getNodeById(nodeId) as any;
    if (!spec) return false;

    // TEXT 노드의 fills 확인
    if (spec.fills) {
      for (const fill of spec.fills) {
        if (
          fill.type === "SOLID" &&
          fill.color &&
          this.isRedColor(fill.color)
        ) {
          return true;
        }
      }
    }

    // FRAME/RECTANGLE의 strokes 확인 (border)
    if (spec.strokes) {
      for (const stroke of spec.strokes) {
        if (
          stroke.type === "SOLID" &&
          stroke.color &&
          this.isRedColor(stroke.color)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 빨간색 판단
   * r > 0.8, g < 0.4, b < 0.4
   * @param color - RGB 색상 객체
   * @returns 빨간색 여부
   */
  private isRedColor(color: RGB): boolean {
    return color.r > 0.8 && color.g < 0.4 && color.b < 0.4;
  }

  /**
   * variant 이름으로 Error 판단
   * @param variantName - variant 이름
   * @returns Error variant 여부
   */
  private isErrorVariantByName(variantName: string): boolean {
    return (
      /status\s*=\s*error/i.test(variantName) ||
      /state\s*=\s*error/i.test(variantName)
    );
  }

  /**
   * variant 값이 Error인지 확인
   * @param value - variant 값
   * @returns Error 값 여부
   */
  private isErrorVariantValue(value: string): boolean {
    return /^error$/i.test(value);
  }

  /**
   * variant 이름에서 Error 값 추출
   * "Status=Error, Size=Large" → "Error"
   * @param variantName - variant 이름
   * @returns Error 값 또는 null
   */
  private extractErrorValueFromVariantName(variantName: string): string | null {
    const match = variantName.match(/(?:status|state)\s*=\s*(\w+)/i);
    if (match && /error/i.test(match[1])) {
      return match[1];
    }
    return null;
  }

  /**
   * Status prop 찾기
   * @param propsMap - props 맵
   * @returns Status prop 또는 null
   */
  private findStatusProp(
    propsMap: Map<string, PropDefinition>
  ): (PropDefinition & { options?: string[] }) | null {
    for (const [, prop] of propsMap) {
      if (/^(status|state)$/i.test(prop.name) && prop.type === "variant") {
        return prop as PropDefinition & { options?: string[] };
      }
    }
    return null;
  }

  /**
   * Error prop 스타일을 nodeStyles.propStyles에 적용
   * @param ctx - 빌드 컨텍스트
   * @param errorResult - Error 상태 감지 결과
   * @returns 업데이트된 nodeStyles 맵
   */
  private applyErrorPropStyles(
    ctx: BuildContext,
    errorResult: ErrorStateResult
  ): Map<string, StyleDefinition> {
    if (!ctx.nodeStyles) return ctx.nodeStyles || new Map();

    const nodeStyles = new Map(ctx.nodeStyles);

    for (const [nodeId, errorStyle] of errorResult.errorStyles) {
      const existingStyle = nodeStyles.get(nodeId);
      if (!existingStyle) continue;

      // error true/false 스타일에서 실제 차이가 있는 속성만 추출
      const trueStyle = errorStyle.true;
      const falseStyle = errorStyle.false;
      const diffStyle: Record<string, string | number> = {};
      const normalStyle: Record<string, string | number> = {};

      for (const [key, value] of Object.entries(trueStyle)) {
        const falseValue = falseStyle[key];
        if (falseValue !== value) {
          diffStyle[key] = value;
          if (falseValue !== undefined) {
            normalStyle[key] = falseValue;
          }
        }
      }

      // 차이가 있으면 propStyles에 추가
      if (Object.keys(diffStyle).length > 0) {
        const propStyles: Record<string, PropStyleGroup> = {
          ...existingStyle.propStyles,
          error: {
            type: "boolean",
            variants: {
              true: diffStyle,
              false: normalStyle,
            },
          },
        };

        nodeStyles.set(nodeId, {
          ...existingStyle,
          propStyles,
        });
      }
    }

    return nodeStyles;
  }
}
