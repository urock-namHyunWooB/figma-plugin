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
   * @returns ArraySlotInfo 배열
   */
  public detectArraySlots(tree: InternalTree): ArraySlotInfo[] {
    const arraySlots: ArraySlotInfo[] = [];

    // 재귀적으로 모든 노드 순회
    this.traverseAndDetect(tree, arraySlots);

    return arraySlots;
  }

  /**
   * 노드를 재귀적으로 순회하면서 Array Slot 감지
   */
  private traverseAndDetect(node: InternalTree, result: ArraySlotInfo[]): void {
    // SECTION 타입은 Array Slot 감지하지 않음
    if (node.type === "SECTION") {
      node.children.forEach((child) => this.traverseAndDetect(child, result));
      return;
    }

    // 자식이 2개 미만이면 Array Slot 불가능
    if (node.children.length < 2) {
      node.children.forEach((child) => this.traverseAndDetect(child, result));
      return;
    }

    // 자식 노드들의 정보 수집
    const childrenInfo = node.children.map((child) => {
      const componentId = this.getComponentId(child);
      const hasVisibilityControl = this.hasVisibilityControl(child);

      return {
        id: child.id,
        name: child.name,
        type: child.type,
        componentId,
        hasVisibilityControl,
      };
    });

    // Array Slot 감지
    const arraySlot = this.detectArraySlotFromChildren(node.id, childrenInfo);
    if (arraySlot) {
      result.push(arraySlot);
    }

    // 재귀 처리
    node.children.forEach((child) => this.traverseAndDetect(child, result));
  }

  /**
   * 자식 노드들에서 Array Slot 패턴 감지
   */
  private detectArraySlotFromChildren(
    parentId: string,
    children: Array<{
      id: string;
      name: string;
      type: string;
      componentId?: string;
      hasVisibilityControl: boolean;
    }>
  ): ArraySlotInfo | null {
    // INSTANCE만 필터링 (visibility 제어가 없는 것만)
    const instances = children.filter(
      (c) => c.type === "INSTANCE" && !c.hasVisibilityControl
    );

    if (instances.length < 2) {
      return null;
    }

    // componentId별로 그룹화
    const byComponentId = new Map<string, typeof instances>();

    for (const inst of instances) {
      if (!inst.componentId) continue;

      const key = inst.componentId;
      if (!byComponentId.has(key)) {
        byComponentId.set(key, []);
      }
      byComponentId.get(key)!.push(inst);
    }

    // 2개 이상 그룹 찾기
    for (const [_componentId, group] of byComponentId.entries()) {
      if (group.length >= 2) {
        // slot 이름 생성 ("Option 1", "Option 2" → "options")
        const slotName = this.generateSlotName(group[0].name);

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
