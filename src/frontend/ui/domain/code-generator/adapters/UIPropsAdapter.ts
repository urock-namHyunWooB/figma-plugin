/**
 * UIPropsAdapter
 *
 * DesignTree를 UI 컨트롤러용 형식으로 변환하는 어댑터
 *
 * 코드 생성 파이프라인(NewEngine)과 UI 레이어 사이의 경계를 담당합니다.
 * DesignTree.props를 PropDefinition[] 형식으로 변환하여 UI에서 사용할 수 있게 합니다.
 */

import type { DesignTree } from "@code-generator/types/architecture";
import type PreparedDesignData from "@code-generator/core/data-preparer/PreparedDesignData";

/**
 * Slot 정보 인터페이스
 */
export interface SlotInfo {
  componentSetId?: string;
  componentName?: string;
  /** dependency 컴포넌트가 컴파일되어 있는지 여부 */
  hasDependency: boolean;
  /** dependency 컴포넌트의 SVG 마크업 (목업용) */
  mockupSvg?: string;
  /** slot 영역의 너비 (px) */
  width?: number;
  /** slot 영역의 높이 (px) */
  height?: number;
}

/**
 * UI용 Props 정의 인터페이스
 */
export interface PropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  originalType?: string;
  /** SLOT 타입인 경우 관련 정보 */
  slotInfo?: SlotInfo;
}

/**
 * UIPropsAdapter
 *
 * DesignTree → UI PropDefinition[] 변환
 */
export class UIPropsAdapter {
  /**
   * UIPropsAdapter 생성자
   * @param data - PreparedDesignData 인스턴스
   */
  constructor(private data: PreparedDesignData) {}

  /**
   * DesignTree.props를 UI 컨트롤러용 형식으로 변환
   * @param designTree - 변환할 DesignTree
   * @param normalizeComponentName - 컴포넌트 이름 정규화 함수
   * @returns UI용 PropDefinition 배열
   */
  public toUIFormat(
    designTree: DesignTree,
    normalizeComponentName: (name: string) => string
  ): PropDefinition[] {
    const result: PropDefinition[] = [];
    const slotInfoMap = this._extractSlotInfoFromDesignTree(
      designTree,
      normalizeComponentName
    );

    for (const prop of designTree.props) {
      const legacyType = this._convertPropTypeToLegacy(prop.type);

      const propDef: PropDefinition = {
        name: prop.name,
        type: legacyType,
        defaultValue: prop.defaultValue,
        variantOptions:
          prop.type === "variant" && "options" in prop
            ? (prop as any).options
            : undefined,
        originalType: prop.type,
      };

      // SLOT 타입이면 slotInfo 추가
      if (legacyType === "SLOT" && slotInfoMap.has(prop.name)) {
        propDef.slotInfo = slotInfoMap.get(prop.name);
      }

      result.push(propDef);
    }

    return result;
  }

  /**
   * 새 타입을 레거시 타입으로 변환
   * @param type - 새 prop 타입 문자열
   * @returns 레거시 prop 타입
   */
  private _convertPropTypeToLegacy(
    type: string
  ): "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT" {
    const mapping: Record<string, "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT"> = {
      variant: "VARIANT",
      string: "TEXT",
      boolean: "BOOLEAN",
      slot: "SLOT",
      number: "TEXT", // number는 TEXT로 fallback
    };

    return mapping[type] || "TEXT";
  }

  /**
   * DesignTree에서 slot 노드의 정보 추출
   * @param designTree - 탐색할 DesignTree
   * @param normalizeComponentName - 컴포넌트 이름 정규화 함수
   * @returns slot 이름을 키로, SlotInfo를 값으로 하는 Map
   */
  private _extractSlotInfoFromDesignTree(
    designTree: DesignTree,
    normalizeComponentName: (name: string) => string
  ): Map<string, SlotInfo> {
    const slotInfoMap = new Map<string, SlotInfo>();
    const groupedDeps =
      this.data.getDependenciesGroupedByComponentSet();
    const dependencies = this.data.getDependencies();

    const traverse = (node: any) => {
      if (!node) return;

      // isSlot이고 slotName이 있는 노드
      if (node.isSlot && node.slotName) {
        const slotName = node.slotName;

        // 1. metaData.vectorSvg에서 SVG 추출 (가장 우선)
        let mockupSvg: string | undefined = node.metaData?.vectorSvg;

        // slot 노드의 크기 추출
        // 1. style.base에서 시도
        const widthStr = node.style?.base?.width;
        const heightStr = node.style?.base?.height;
        let width = widthStr ? parseFloat(widthStr) : undefined;
        let height = heightStr ? parseFloat(heightStr) : undefined;

        // 2. style.base에 없으면 원본 스펙의 absoluteBoundingBox에서 가져오기
        if (width === undefined || height === undefined) {
          const spec = this.data.getSpecById(node.id) as any;
          const bbox = spec?.absoluteBoundingBox;
          if (bbox) {
            if (width === undefined) width = bbox.width;
            if (height === undefined) height = bbox.height;
          }
        }

        // externalComponent 정보가 있으면 dependency 컴포넌트 정보 추출
        if (node.externalRef) {
          const componentSetId = node.externalRef.componentSetId;
          const componentId = node.externalRef.componentId;
          const depInfo = componentSetId ? groupedDeps[componentSetId] : null;

          // 2. metaData에 없으면 dependency에서 SVG 추출
          if (!mockupSvg) {
            const depData = componentId ? dependencies?.[componentId] : null;
            if (depData?.vectorSvgs) {
              const svgs = Object.values(depData.vectorSvgs);
              if (svgs.length > 0) {
                mockupSvg = svgs[0] as string;
              }
            }
          }

          slotInfoMap.set(slotName, {
            componentSetId,
            componentName: depInfo?.componentSetName
              ? normalizeComponentName(depInfo.componentSetName)
              : node.externalRef.componentName,
            hasDependency: !!depInfo,
            mockupSvg,
            width,
            height,
          });
        } else {
          // externalRef가 없어도 metaData에서 SVG 추출 가능
          slotInfoMap.set(slotName, {
            componentName: node.name,
            hasDependency: false,
            mockupSvg,
            width,
            height,
          });
        }
      }

      // 자식 노드 순회
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(designTree.root);
    return slotInfoMap;
  }
}

export default UIPropsAdapter;
