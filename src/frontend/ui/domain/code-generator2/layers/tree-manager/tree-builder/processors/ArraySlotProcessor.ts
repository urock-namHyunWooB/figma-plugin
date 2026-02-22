/**
 * ArraySlotProcessor
 *
 * Array Slot 감지 및 처리
 *
 * 감지 조건:
 * - 같은 부모 아래 2개 이상의 INSTANCE
 * - 동일한 componentId (원본 컴포넌트 참조)
 * - componentPropertyReferences.visible이 없음 (visibility 제어가 아님)
 *
 * 결과:
 * - ArraySlotInfo 생성
 * - JsxGenerator에서 .map() 렌더링
 */

import type { InternalTree, ArraySlotInfo } from "../../../types/types";
import type DataManager from "../../data-manager/DataManager";

export class ArraySlotProcessor {
  constructor(private readonly dataManager: DataManager) {}

  /**
   * InternalTree에서 Array Slot 감지
   *
   * @param tree - 변환된 InternalTree (VariantMerger 결과)
   * @param existingProps - 기존 Props (이미 slot으로 처리된 INSTANCE 제외용)
   * @returns ArraySlotInfo 배열
   */
  public detectArraySlots(tree: InternalTree, existingProps: Array<{ name: string; type: string }>): ArraySlotInfo[] {
    const arraySlots: ArraySlotInfo[] = [];

    // 기존 slot props 이름 추출
    const existingSlotNames = new Set(
      existingProps.filter((p) => p.type === "slot").map((p) => p.name)
    );

    // 재귀적으로 모든 노드 순회
    this.traverseAndDetect(tree, arraySlots, existingSlotNames);

    return arraySlots;
  }

  /**
   * 노드를 재귀적으로 순회하면서 Array Slot 감지
   */
  private traverseAndDetect(node: InternalTree, result: ArraySlotInfo[], existingSlotNames: Set<string>): void {
    // SECTION 타입은 Array Slot 감지하지 않음
    if (node.type === "SECTION") {
      node.children.forEach((child) => this.traverseAndDetect(child, result, existingSlotNames));
      return;
    }

    // 자식이 2개 미만이면 Array Slot 불가능
    if (node.children.length < 2) {
      node.children.forEach((child) => this.traverseAndDetect(child, result, existingSlotNames));
      return;
    }

    // Array Slot 감지 (InternalTree 노드를 직접 전달)
    const arraySlot = this.detectArraySlotFromChildren(node.id, node.children, existingSlotNames);
    if (arraySlot) {
      result.push(arraySlot);
    }

    // 재귀 처리
    node.children.forEach((child) => this.traverseAndDetect(child, result, existingSlotNames));
  }

  /**
   * 자식 노드들에서 Array Slot 패턴 감지
   */
  private detectArraySlotFromChildren(
    parentId: string,
    children: InternalTree[],
    existingSlotNames: Set<string>
  ): ArraySlotInfo | null {
    // INSTANCE만 필터링 (visibility 제어가 없는 것만)
    const instances = children.filter(
      (c) => c.type === "INSTANCE" && !this.hasVisibilityControl(c)
    );

    if (instances.length < 2) {
      return null;
    }

    // componentId별로 그룹화
    const byComponentId = new Map<string, InternalTree[]>();

    for (const inst of instances) {
      const componentId = this.getComponentId(inst);
      if (!componentId) continue;

      if (!byComponentId.has(componentId)) {
        byComponentId.set(componentId, []);
      }
      byComponentId.get(componentId)!.push(inst);
    }

    // 2개 이상 그룹 찾기
    for (const [_componentId, group] of byComponentId.entries()) {
      if (group.length >= 2) {
        // slot 이름 생성 ("Option 1", "Option 2" → "options")
        const slotName = this.generateSlotName(group[0].name);

        // 이미 slot props로 처리된 경우 제외
        if (existingSlotNames.has(slotName)) {
          continue;
        }

        // variant 배타성 확인: 서로 배타적인 variant 조합에서만 나타나면 Array Slot이 아님
        if (this.areVariantExclusive(group)) {
          continue;
        }

        return {
          parentId,
          nodeIds: group.map((g) => g.id),
          slotName,
          // itemComponentName, itemProps는 나중에 ExternalRefsProcessor에서 채움
        };
      }
    }

    return null;
  }

  /**
   * 노드들이 variant 배타적인지 확인
   * 예: Left Icon=True vs Right Icon=True → 배타적 (서로 다른 slot)
   */
  private areVariantExclusive(nodes: InternalTree[]): boolean {
    // mergedNodes가 없으면 배타성 판단 불가
    if (!nodes[0].mergedNodes || nodes[0].mergedNodes.length === 0) {
      return false;
    }

    // 각 노드의 variant props 추출
    const variantPropsSets = nodes.map((node) => {
      const variants = new Set<string>();
      for (const merged of node.mergedNodes || []) {
        if (merged.variantName) {
          // "Size=Large, State=Default, Left Icon=True" 파싱
          const props = merged.variantName.split(", ");
          for (const prop of props) {
            variants.add(prop.trim());
          }
        }
      }
      return variants;
    });

    // 모든 variant prop의 교집합 확인
    // 교집합에서 특정 prop의 값이 서로 다르면 배타적
    const allVariantProps = new Map<string, Set<string>>();
    for (let i = 0; i < nodes.length; i++) {
      for (const variantProp of variantPropsSets[i]) {
        const [key, value] = variantProp.split("=");
        if (!allVariantProps.has(key)) {
          allVariantProps.set(key, new Set());
        }
        allVariantProps.get(key)!.add(`${i}:${value}`); // 노드 인덱스와 값 저장
      }
    }

    // 각 variant prop에 대해 모든 노드가 서로 다른 값을 가지는지 확인
    for (const [_key, values] of allVariantProps.entries()) {
      const nodeIndices = new Set<number>();
      for (const val of values) {
        const [nodeIdx] = val.split(":");
        nodeIndices.add(parseInt(nodeIdx));
      }

      // 모든 노드가 이 prop에 대해 서로 다른 값을 가지면 배타적
      if (nodeIndices.size === nodes.length && values.size === nodes.length) {
        return true;
      }
    }

    return false;
  }

  /**
   * INSTANCE의 componentId 추출
   *
   * INSTANCE는 componentId 필드를 직접 가지고 있음
   */
  private getComponentId(node: InternalTree): string | undefined {
    if (node.type !== "INSTANCE") {
      return undefined;
    }

    const { node: figmaNode } = this.dataManager.getById(node.id);

    if (!figmaNode || !("componentId" in figmaNode)) {
      return undefined;
    }

    return (figmaNode as any).componentId;
  }

  /**
   * visibility 제어 여부 확인
   *
   * componentPropertyReferences.visible이 있으면 visibility 제어
   * → Array Slot이 아니라 조건부 렌더링 slot
   */
  private hasVisibilityControl(node: InternalTree): boolean {
    const { node: figmaNode } = this.dataManager.getById(node.id);

    if (!figmaNode || !("componentPropertyReferences" in figmaNode)) {
      return false;
    }

    const refs = figmaNode.componentPropertyReferences as Record<string, string> | undefined;
    return !!refs?.visible;
  }

  /**
   * slot 이름 생성
   *
   * "Option 1", "Option 2" → "options"
   * "Item-1", "Item-2" → "items"
   */
  private generateSlotName(firstName: string): string {
    // 숫자 제거 ("Option 1" → "Option", "Item-1" → "Item")
    const baseNameWithoutNumber = firstName.replace(/[\s_-]*\d+$/, "");

    // camelCase 변환
    const baseName = this.toCamelCase(baseNameWithoutNumber);

    // 복수형 변환 (이미 's'로 끝나면 그대로, 아니면 's' 추가)
    const slotName = baseName.endsWith("s") ? baseName : `${baseName}s`;

    return slotName;
  }

  /**
   * camelCase 변환
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
      .replace(/^[A-Z]/, (char) => char.toLowerCase());
  }
}
