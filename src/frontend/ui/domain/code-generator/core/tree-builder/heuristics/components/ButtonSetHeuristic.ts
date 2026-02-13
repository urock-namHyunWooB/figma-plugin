/**
 * ButtonSetHeuristic
 *
 * 버튼 세트 컴포넌트 휴리스틱.
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

import type { BuildContext } from "../../workers/BuildContext";
import type { InternalNode, ExternalRefData } from "../../workers/interfaces";
import type { PropDefinition } from "@code-generator/types/architecture";
import { GenericHeuristic } from "./GenericHeuristic";
import { VariantProcessor } from "../../workers/VariantProcessor";
import { SlotProcessor } from "../../workers/SlotProcessor";
import { InstanceProcessor } from "../../workers/InstanceProcessor";
import { hasChildren, isComponentSetNode } from "../../workers/utils/typeGuards";
import { toCamelCase } from "../../workers/utils/stringUtils";

export class ButtonSetHeuristic extends GenericHeuristic {
  readonly componentType = "buttonSet" as const;
  readonly name = "ButtonSetHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

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

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= ButtonSetHeuristic.MATCH_THRESHOLD;
  }

  /**
   * Phase 1: 구조 생성 - 이름 기반 매칭 사용
   */
  processVariants(ctx: BuildContext): BuildContext {
    const data = ctx.data;
    const doc = data.document;

    if (!isComponentSetNode(doc) || !hasChildren(doc)) {
      return VariantProcessor.merge(ctx);
    }

    const variants = doc.children as SceneNode[];
    if (variants.length === 0) {
      return VariantProcessor.merge(ctx);
    }

    // 이름 기반으로 variant 병합
    const internalTree = this.mergeVariantsByName(variants, data);
    internalTree.name = doc.name;

    return { ...ctx, internalTree };
  }

  /**
   * 이름 기반 variant 병합
   *
   * IoU 대신 노드 이름(Option 1, Option 2 등)으로 매칭
   */
  private mergeVariantsByName(
    variants: SceneNode[],
    data: any
  ): InternalNode {
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

      this.mergeByName(baseTree, variantTree);
    }

    // 중복 노드 제거 (같은 이름의 노드가 여러 개 있으면 하나로 병합)
    this.deduplicateByName(baseTree);

    return baseTree;
  }

  /**
   * 이름 기반으로 두 트리 병합
   */
  private mergeByName(base: InternalNode, target: InternalNode): void {
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
        this.mergeByName(matchingBase, targetChild);
      } else {
        // 새로운 노드 → base에 추가
        targetChild.parent = base;
        base.children.push(targetChild);
      }
    }
  }

  /**
   * 같은 이름의 중복 노드 제거
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

  /**
   * Phase 3: Slot 처리 - ArraySlot 감지 비활성화
   *
   * ButtonSet에서는 Options variant를 ArraySlot이 아닌 Visibility로 처리
   */
  processSlots(ctx: BuildContext): BuildContext {
    // TextSlot만 감지하고 ArraySlot은 건너뜀
    let result = ctx;
    result = SlotProcessor.detectTextSlots(result);
    result = SlotProcessor.detectSlots(result);
    // ArraySlot 감지 건너뜀
    return result;
  }

  /**
   * Phase 3: External refs 생성 - 버튼 텍스트 props 추가
   *
   * 각 Option 버튼의 labelText를 option1Text, option2Text 등으로 노출
   */
  processExternalRefs(ctx: BuildContext): BuildContext {
    // 기본 buildExternalRefs 실행
    let result = InstanceProcessor.buildExternalRefs(ctx);

    // Option 버튼 텍스트 props 추가
    result = this.addOptionTextProps(result);

    return result;
  }

  /**
   * 각 Option 버튼의 텍스트를 별도 props로 노출
   *
   * Option 1 → option1Text
   * Option 2 → option2Text
   * Option 3 → option3Text
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

      // externalRef.props.labelText를 prop 참조로 변경
      // ComponentGenerator가 부모에 같은 이름의 prop이 있으면 prop 참조로 렌더링함
      // 그래서 externalRef.props에는 prop 이름을 저장하고,
      // propsMap에 해당 prop을 추가하면 됨
      const updatedExternalRef: ExternalRefData = {
        ...externalRef,
        props: {
          ...externalRef.props,
          // labelText를 제거하고 새 prop 이름으로 대체하는 게 아니라,
          // 부모 prop과 같은 이름으로 변경해야 함
          // ComponentGenerator.createExternalComponentJsx에서
          // parentHasSameProp 체크하므로, labelText를 option1Text로 변경
        },
        // 새로운 속성으로 prop 매핑 저장
        propMappings: {
          ...(externalRef as any).propMappings,
          labelText: propName,
        },
      };

      nodeExternalRefs.set(child.id, updatedExternalRef);
    }

    return { ...ctx, propsMap, nodeExternalRefs };
  }

  /**
   * Phase 2: 분석 - Options variant 기반 hidden 조건 추가
   */
  processAnalysis(ctx: BuildContext): BuildContext {
    // 기본 분석 실행
    let result = super.processAnalysis(ctx);

    // Options variant 찾기
    const optionsProp = this.findOptionsVariantProp(ctx);
    if (!optionsProp) {
      return result;
    }

    // Options variant 기반으로 hiddenConditions 추가
    result = this.applyOptionsHiddenConditions(result, optionsProp);

    return result;
  }

  /**
   * Options variant prop 찾기
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
   * Options variant 기반 hiddenConditions 적용
   *
   * "2 options" → Option 1, Option 2만 표시
   * "3 options" → Option 1, Option 2, Option 3 표시
   */
  private applyOptionsHiddenConditions(
    ctx: BuildContext,
    optionsProp: { name: string; options: string[] }
  ): BuildContext {
    if (!ctx.internalTree) return ctx;

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
      // 예: Option 3은 "3 options"에서만 존재
      const minOptions = optionNumber;
      const condition = this.buildOptionsConditionNode(optionsProp, minOptions);

      if (condition) {
        hiddenConditions.set(child.id, condition);
      }
    }

    return { ...ctx, hiddenConditions };
  }

  /**
   * Options 조건 ConditionNode 생성
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
   */
  private getTotalVariantCount(ctx: BuildContext): number {
    const doc = ctx.data.document;
    if (isComponentSetNode(doc) && hasChildren(doc)) {
      return doc.children.length;
    }
    return 1;
  }
}
