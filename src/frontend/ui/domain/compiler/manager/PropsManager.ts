import SpecDataManager from "./SpecDataManager";
import PropsExtractor from "./PropsExtractor";

import type { PropsDef } from "./PropsExtractor";

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
}

/**
 * Props 정의 인터페이스
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
 * Props 도메인 전체를 담당하는 매니저
 *
 * 1. 추출 (Extract): Figma 원본 데이터에서 Props 정의 추출
 * 2. 포맷팅 (Format): AST 트리에서 UI용 Props 정의 생성
 */
class PropsManager {
  private extractor: PropsExtractor;

  constructor(private specDataManager: SpecDataManager) {
    this.extractor = new PropsExtractor(specDataManager);
  }

  /**
   * 추출된 Props 정의 반환 (AST 생성용)
   * Figma 원본 데이터에서 추출된 정규화된 props
   */
  public get extractedProps(): PropsDef {
    return this.extractor.refinedProps;
  }

  /**
   * Props 정의 반환 (UI 컨트롤러 생성용)
   * @param astTree 최종 AST 트리
   * @param normalizeComponentName 컴포넌트 이름 정규화 함수
   */
  public getPropsDefinition(
    astTree: any,
    normalizeComponentName: (name: string) => string
  ): PropDefinition[] {
    const props = astTree.props;

    // slot 노드에서 componentSetId 정보 추출
    const slotInfoMap = this._extractSlotInfoFromAstTree(
      astTree,
      normalizeComponentName
    );

    return Object.entries(props).map(([name, def]: [string, any]) => {
      const propDef: PropDefinition = {
        name,
        type: def.type,
        defaultValue: def.defaultValue,
        variantOptions: def.variantOptions,
        originalType: def.originalType,
      };

      // SLOT 타입이면 slotInfo 추가
      if (def.type === "SLOT" && slotInfoMap.has(name)) {
        propDef.slotInfo = slotInfoMap.get(name);
      }

      return propDef;
    });
  }

  /**
   * AST 트리에서 slot 노드의 정보 추출
   */
  private _extractSlotInfoFromAstTree(
    astTree: any,
    normalizeComponentName: (name: string) => string
  ): Map<string, SlotInfo> {
    const slotInfoMap = new Map<string, SlotInfo>();
    const groupedDeps =
      this.specDataManager.getDependenciesGroupedByComponentSet();
    const dependencies = this.specDataManager.getDependencies();

    const traverse = (node: any) => {
      if (!node) return;

      // isSlot이고 slotName이 있는 노드
      if (node.isSlot && node.slotName) {
        const slotName = node.slotName;

        // 1. metaData.vectorSvg에서 SVG 추출 (가장 우선)
        let mockupSvg: string | undefined = node.metaData?.vectorSvg;

        // externalComponent 정보가 있으면 dependency 컴포넌트 정보 추출
        if (node.externalComponent) {
          const componentSetId = node.externalComponent.componentSetId;
          const componentId = node.externalComponent.componentId;
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
              : node.externalComponent.componentName,
            hasDependency: !!depInfo,
            mockupSvg,
          });
        } else {
          // externalComponent가 없어도 metaData에서 SVG 추출 가능
          slotInfoMap.set(slotName, {
            componentName: node.name,
            hasDependency: false,
            mockupSvg,
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

    traverse(astTree);
    return slotInfoMap;
  }
}

export default PropsManager;
