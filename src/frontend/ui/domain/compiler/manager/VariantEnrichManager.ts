import SpecDataManager from "./SpecDataManager";

import type { FigmaNodeData } from "@compiler/types/baseType";

/**
 * Variant 데이터를 풍부화(enrich)하는 매니저
 *
 * 의존성 컴포넌트를 컴파일하기 전에 필요한 데이터를 주입:
 * - VectorSVG 정보 주입
 * - 루트 크기 유연화 (100%로 설정)
 * - 중첩 dependencies 정보 주입
 */
class VariantEnrichManager {
  constructor(private specDataManager: SpecDataManager) {}

  /**
   * 의존 컴포넌트 데이터에 vectorSvg 주입
   * 메인 문서의 인스턴스에서 merged SVG를 추출하여 루트 노드에 설정
   */
  public enrichWithVectorSvg(
    variant: FigmaNodeData,
    instancesByComponentId: Map<string, string[]>
  ): FigmaNodeData {
    const rootComponentId =
      variant.info.document.componentId || variant.info.document.id;

    // 해당 컴포넌트를 참조하는 인스턴스 찾기
    const instanceIds = instancesByComponentId.get(rootComponentId);
    if (!instanceIds || instanceIds.length === 0) {
      return variant;
    }

    // 첫 번째 인스턴스의 merged SVG 추출
    const firstInstanceId = instanceIds[0];
    const mergedSvg =
      this.specDataManager.mergeInstanceVectorSvgs(firstInstanceId);

    if (!mergedSvg) {
      return variant;
    }

    // variant 데이터에 vectorSvgs 추가 (루트 노드 ID를 키로)
    const rootNodeId = variant.info.document.id;
    return {
      ...variant,
      vectorSvgs: {
        ...(variant.vectorSvgs || {}),
        [rootNodeId]: mergedSvg,
      },
    };
  }

  /**
   * dependency 컴포넌트의 루트를 유연하게 만들기 (width/height를 100%로 설정)
   * 사용하는 곳(INSTANCE)의 wrapper가 크기와 padding을 제공하고, 컴포넌트는 그 안을 채움
   */
  public makeRootFlexible(variant: FigmaNodeData): FigmaNodeData {
    if (!variant.styleTree?.cssStyle) {
      return variant;
    }

    // 기존 width/height/padding 제거하고 100%로 대체
    // wrapper에서 이미 padding을 적용하므로 dependency에서는 제거
    const {
      width: _width,
      height: _height,
      padding: _padding,
      "padding-top": _paddingTop,
      "padding-right": _paddingRight,
      "padding-bottom": _paddingBottom,
      "padding-left": _paddingLeft,
      ...restCssStyle
    } = variant.styleTree.cssStyle;

    return {
      ...variant,
      styleTree: {
        ...variant.styleTree,
        cssStyle: {
          ...restCssStyle,
          width: "100%",
          height: "100%",
        },
      },
    };
  }

  /**
   * 의존 컴포넌트에 중첩 dependencies 정보 주입
   * 루트의 dependencies를 전달하되, _skipDependencyCompilation 플래그로 재귀 방지
   */
  public enrichWithDependencies(
    variant: FigmaNodeData,
    rootDependencies: Record<string, any>
  ): FigmaNodeData {
    if (!rootDependencies || Object.keys(rootDependencies).length === 0) {
      return variant;
    }

    // 루트 dependencies에서 componentSets/components 정보 수집
    const mergedComponentSets: Record<string, any> = {
      ...(variant.info.componentSets || {}),
    };
    const mergedComponents: Record<string, any> = {
      ...(variant.info.components || {}),
    };

    for (const dep of Object.values(rootDependencies)) {
      const depInfo = (dep as any).info || {};
      if (depInfo.componentSets) {
        Object.assign(mergedComponentSets, depInfo.componentSets);
      }
      if (depInfo.components) {
        Object.assign(mergedComponents, depInfo.components);
      }
    }

    // variant에 dependencies 및 info 병합
    // _skipDependencyCompilation은 getGeneratedCodeWithDependencies에서 체크
    return {
      ...variant,
      dependencies: {
        ...(variant.dependencies || {}),
        ...rootDependencies,
      },
      _skipDependencyCompilation: true, // 재귀 방지 플래그
      info: {
        ...variant.info,
        componentSets: mergedComponentSets,
        components: mergedComponents,
      },
    };
  }
}

export default VariantEnrichManager;
