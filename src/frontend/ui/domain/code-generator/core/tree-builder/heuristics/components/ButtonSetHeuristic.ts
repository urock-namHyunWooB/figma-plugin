/**
 * ButtonSetHeuristic
 *
 * 버튼 세트 컴포넌트 휴리스틱 (Composition 패턴).
 * SelectButtons처럼 여러 버튼이 가로로 배열된 컴포넌트를 처리합니다.
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: select button, button set, button group, segmented control
 * - Options variant: "2 options", "3 options" 등 숫자 + options 패턴
 * - children이 모두 INSTANCE 타입
 *
 * 특수 처리:
 * - 이름 기반 노드 매칭 (IoU 대신)
 * - Options variant → 조건부 렌더링 (ArraySlot 대신)
 * - 각 버튼의 Label 텍스트를 별도 props로 노출
 */

import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType, PropDefinition } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";
import type { IComponentHeuristic } from "./IComponentHeuristic";
import type { InternalNode, ExternalRefData } from "../../workers/interfaces";

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
import { hasChildren, isComponentSetNode } from "../../workers/utils/typeGuards";

export class ButtonSetHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "buttonSet";
  readonly name = "ButtonSetHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

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
    selected: ":checked",
    default: null,
    normal: null,
  };

  /**
   * State 문자열을 CSS pseudo-class로 변환
   * @param state - State 문자열 (예: "hover", "selected")
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
   * ButtonSet 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - Options variant 존재 (숫자 + options 패턴): +10 (필수 조건)
   * - select button(s): +5
   * - button set: +5
   * - button group: +5
   * - segmented control: +5
   * - children이 모두 INSTANCE: +3
   *
   * Options variant가 없으면 매칭되지 않음 (ArraySlot으로 처리됨)
   *
   * @param ctx - 빌드 컨텍스트
   * @returns 매칭 점수 (0 이상)
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name.toLowerCase();

    // Options variant 확인 (필수 조건)
    let hasOptionsVariant = false;
    const props = ctx.data.props as Record<string, { type?: string; variantOptions?: string[] }> | undefined;
    if (props) {
      for (const [propName, propDef] of Object.entries(props)) {
        if (propDef?.type === "VARIANT" && /options?/i.test(propName)) {
          // "2 options", "3 options" 패턴 확인
          const hasOptionsPattern = propDef.variantOptions?.some(opt =>
            /^\d+\s*options?$/i.test(opt)
          );
          if (hasOptionsPattern) {
            hasOptionsVariant = true;
            score += 10;
            break;
          }
        }
      }
    }

    // Options variant가 없으면 매칭 안 됨
    if (!hasOptionsVariant) {
      return 0;
    }

    // 이름 패턴 매칭 (보조 점수)
    if (/select\s*button/i.test(name)) score += 5;
    if (/button\s*set/i.test(name)) score += 5;
    if (/button\s*group/i.test(name)) score += 5;
    if (/segmented\s*control/i.test(name)) score += 5;

    // children이 모두 INSTANCE인지 확인
    const doc = ctx.data.document;
    if (isComponentSetNode(doc) && hasChildren(doc)) {
      const firstVariant = doc.children[0];
      if (firstVariant && "children" in firstVariant && firstVariant.children) {
        const allInstance = firstVariant.children.every(
          (child: any) => child.type === "INSTANCE"
        );
        if (allInstance && firstVariant.children.length >= 2) {
          score += 3;
        }
      }
    }

    return score;
  }

  /**
   * 이 휴리스틱이 해당 컴포넌트를 처리할 수 있는지 판별
   * @param ctx - 빌드 컨텍스트
   * @returns 처리 가능 여부
   */
  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= ButtonSetHeuristic.MATCH_THRESHOLD;
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

    // Phase 1: 구조 생성 (이름 기반 variant 병합)
    result = this.mergeVariantsByName(result);
    result = CleanupProcessor.removeInstanceInternalNodes(result);
    result = PropsProcessor.extract(result);

    // Phase 2: 분석 (Options 기반 hidden 조건 추가)
    result = NodeProcessor.detectSemanticRoles(result);
    result = VisibilityProcessor.processHidden(result);
    result = this.applyOptionsHiddenConditions(result);

    // Phase 3: 노드 변환
    result = NodeProcessor.mapTypes(result);
    result = StyleProcessor.build(result);
    result = StyleProcessor.applyPositions(result);
    result = StyleProcessor.handleRotation(result);
    result = InstanceProcessor.buildExternalRefs(result);
    result = this.addOptionTextProps(result);  // ButtonSet 특화
    result = VisibilityProcessor.resolve(result);
    result = PropsProcessor.bindProps(result);
    result = SlotProcessor.detectTextSlots(result);
    result = SlotProcessor.detectSlots(result);
    // ArraySlot 감지 건너뜀 (Options variant로 처리)

    // Phase 4: 최종 조립
    result = NodeConverter.assemble(result);

    return result;
  }

  // ===========================================================================
  // ButtonSet 특화 처리 - 이름 기반 variant 병합
  // ===========================================================================

  /**
   * 이름 기반으로 variant 병합
   *
   * IoU 대신 노드 이름(Option 1, Option 2 등)으로 매칭
   *
   * @param ctx - 빌드 컨텍스트
   * @returns variant가 병합된 BuildContext
   */
  private mergeVariantsByName(ctx: BuildContext): BuildContext {
    const data = ctx.data;
    const doc = data.document;

    if (!isComponentSetNode(doc) || !hasChildren(doc)) {
      return VariantProcessor.merge(ctx);
    }

    const variants = doc.children as SceneNode[];
    if (variants.length === 0) {
      return VariantProcessor.merge(ctx);
    }

    // 첫 번째 variant를 기준으로 시작
    const baseVariant = variants[0];
    const processor = new VariantProcessor();

    // 기본 트리 생성
    const baseTree = processor.convertToInternalNode(
      baseVariant,
      null,
      baseVariant.name,
      data
    );

    // 나머지 variant들을 이름 기반으로 병합
    for (let i = 1; i < variants.length; i++) {
      const variant = variants[i];
      const variantTree = processor.convertToInternalNode(
        variant,
        null,
        variant.name,
        data
      );

      this.mergeTreeByName(baseTree, variantTree);
    }

    // 중복 노드 제거
    this.deduplicateByName(baseTree);

    baseTree.name = doc.name;

    return { ...ctx, internalTree: baseTree };
  }

  /**
   * 이름 기반으로 두 트리 병합
   * @param base - 기준 트리
   * @param target - 병합할 트리
   */
  private mergeTreeByName(base: InternalNode, target: InternalNode): void {
    // 루트 노드 병합
    base.mergedNode.push(...target.mergedNode);

    // 자식 노드들을 이름으로 매칭
    for (const targetChild of target.children) {
      const matchingBase = base.children.find(
        baseChild =>
          baseChild.type === targetChild.type &&
          baseChild.name === targetChild.name
      );

      if (matchingBase) {
        // 같은 이름의 노드 발견 → mergedNode에 추가
        matchingBase.mergedNode.push(...targetChild.mergedNode);
        // 재귀적으로 자식도 병합
        this.mergeTreeByName(matchingBase, targetChild);
      } else {
        // 새로운 노드 → base에 추가
        targetChild.parent = base;
        base.children.push(targetChild);
      }
    }
  }

  /**
   * 같은 이름의 중복 노드 제거
   * @param node - 처리할 InternalNode
   */
  private deduplicateByName(node: InternalNode): void {
    const seenNames = new Map<string, InternalNode>();
    const uniqueChildren: InternalNode[] = [];

    for (const child of node.children) {
      const key = `${child.type}:${child.name}`;
      const existing = seenNames.get(key);

      if (existing) {
        // 중복 → mergedNode만 병합
        existing.mergedNode.push(...child.mergedNode);
      } else {
        seenNames.set(key, child);
        uniqueChildren.push(child);
      }
    }

    node.children = uniqueChildren;

    // 재귀적으로 자식들도 처리
    for (const child of node.children) {
      this.deduplicateByName(child);
    }
  }

  // ===========================================================================
  // ButtonSet 특화 처리 - Options 기반 Hidden 조건
  // ===========================================================================

  /**
   * Options variant 기반 hiddenConditions 적용
   * @param ctx - 빌드 컨텍스트
   * @returns hiddenConditions가 적용된 BuildContext
   */
  private applyOptionsHiddenConditions(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) return ctx;

    // Options variant 찾기
    const optionsProp = this.findOptionsVariantProp(ctx);
    if (!optionsProp) {
      return ctx;
    }

    const hiddenConditions = new Map(ctx.hiddenConditions || []);
    const totalVariantCount = this.getTotalVariantCount(ctx);

    // 각 Option 노드에 대해 visibility 조건 설정
    for (const child of ctx.internalTree.children) {
      // Option N 패턴 확인
      const optionMatch = child.name.match(/^Option\s*(\d+)$/i);
      if (!optionMatch) continue;

      const optionNumber = parseInt(optionMatch[1], 10);
      const variantCount = child.mergedNode.length;

      // 모든 variant에 존재하면 조건 없음
      if (variantCount >= totalVariantCount) continue;

      // 특정 Options에서만 존재하는 경우 조건 추가
      const minOptions = optionNumber;
      const condition = this.buildOptionsConditionNode(optionsProp, minOptions);

      if (condition) {
        hiddenConditions.set(child.id, condition);
      }
    }

    return { ...ctx, hiddenConditions };
  }

  /**
   * Options variant prop 찾기
   * @param ctx - 빌드 컨텍스트
   * @returns Options variant 정보 또는 null
   */
  private findOptionsVariantProp(ctx: BuildContext): {
    name: string;
    options: string[];
  } | null {
    const props = ctx.data.props as Record<string, { type?: string; variantOptions?: string[] }> | undefined;
    if (!props) return null;

    for (const [propName, propDef] of Object.entries(props)) {
      if (propDef?.type === "VARIANT" && /options?/i.test(propName)) {
        const options = propDef.variantOptions || [];
        const hasOptionsPattern = options.some(opt => /^\d+\s*options?$/i.test(opt));
        if (hasOptionsPattern) {
          return { name: propName, options };
        }
      }
    }

    return null;
  }

  /**
   * Options 조건 ConditionNode 생성
   * @param optionsProp - Options variant 정보
   * @param minOptions - 최소 옵션 수
   * @returns ConditionNode 또는 null
   */
  private buildOptionsConditionNode(
    optionsProp: { name: string; options: string[] },
    minOptions: number
  ): any | null {
    // minOptions 이상인 옵션들 찾기
    const validOptions = optionsProp.options.filter(opt => {
      const match = opt.match(/^(\d+)\s*options?$/i);
      if (!match) return false;
      return parseInt(match[1], 10) >= minOptions;
    });

    if (validOptions.length === 0) return null;
    if (validOptions.length === optionsProp.options.length) return null;

    // ConditionNode 생성
    const propName = optionsProp.name.charAt(0).toLowerCase() + optionsProp.name.slice(1);

    const createBinaryCondition = (value: string) => ({
      type: "BinaryExpression",
      operator: "===",
      left: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "props" },
        property: { type: "Identifier", name: propName },
        computed: false,
      },
      right: { type: "Literal", value },
    });

    if (validOptions.length === 1) {
      return createBinaryCondition(validOptions[0]);
    }

    // OR로 결합
    return validOptions.reduce((acc: any, opt, index) => {
      const cond = createBinaryCondition(opt);
      if (index === 0) return cond;
      return {
        type: "LogicalExpression",
        operator: "||",
        left: acc,
        right: cond,
      };
    }, null);
  }

  /**
   * 전체 variant 개수 반환
   * @param ctx - 빌드 컨텍스트
   * @returns variant 개수
   */
  private getTotalVariantCount(ctx: BuildContext): number {
    const doc = ctx.data.document;
    if (isComponentSetNode(doc) && hasChildren(doc)) {
      return doc.children.length;
    }
    return 1;
  }

  // ===========================================================================
  // ButtonSet 특화 처리 - Option 텍스트 Props
  // ===========================================================================

  /**
   * 각 Option 버튼의 텍스트를 별도 props로 노출
   *
   * Option 1 → option1Text
   * Option 2 → option2Text
   * Option 3 → option3Text
   *
   * @param ctx - 빌드 컨텍스트
   * @returns Option 텍스트 props가 추가된 BuildContext
   */
  private addOptionTextProps(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.nodeExternalRefs) {
      return ctx;
    }

    const propsMap = new Map(ctx.propsMap || []);
    const nodeExternalRefs = new Map(ctx.nodeExternalRefs);

    // 각 Option 노드 처리
    for (const child of ctx.internalTree.children) {
      // Option N 패턴 확인
      const optionMatch = child.name.match(/^Option\s*(\d+)$/i);
      if (!optionMatch) continue;

      const optionNumber = optionMatch[1];
      const propName = `option${optionNumber}Text`;

      // externalRef 찾기
      const externalRef = nodeExternalRefs.get(child.id);
      if (!externalRef) continue;

      // 기존 labelText 값 가져오기
      const labelTextValue = externalRef.props.labelText;
      if (labelTextValue === undefined) continue;

      // 새 prop 정의 추가
      const propDef: PropDefinition = {
        name: propName,
        type: "string",
        defaultValue: labelTextValue,
        required: false,
      };
      propsMap.set(propName, propDef);

      // externalRef에 prop 매핑 저장
      const updatedExternalRef: ExternalRefData = {
        ...externalRef,
        propMappings: {
          ...(externalRef as any).propMappings,
          labelText: propName,
        },
      };

      nodeExternalRefs.set(child.id, updatedExternalRef);
    }

    return { ...ctx, propsMap, nodeExternalRefs };
  }
}
