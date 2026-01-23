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
    // mergeInstanceVectorSvgs가 실패하면 (absoluteBoundingBox 없음) fallback 사용
    const firstInstanceId = instanceIds[0];
    const mergedSvg =
      this.specDataManager.mergeInstanceVectorSvgs(firstInstanceId) ||
      this.specDataManager.getFirstVectorSvgByInstanceId(firstInstanceId);

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
   * 모든 variant의 SVG를 수집하여 variant name을 키로 하는 map 생성
   * COMPONENT_SET의 variant들이 서로 다른 SVG(INSTANCE_SWAP 등)를 가질 때 사용
   * @returns variant name (예: "Size=Normal")을 키로 하는 SVG map
   */
  public collectAllVariantSvgs(
    variants: FigmaNodeData[],
    instancesByComponentId: Map<string, string[]>
  ): Record<string, string> {
    const svgByVariantName: Record<string, string> = {};

    for (const variant of variants) {
      const variantName = variant.info.document.name;
      const componentId = variant.info.document.id;

      // 해당 variant를 참조하는 인스턴스 찾기
      const instanceIds = instancesByComponentId.get(componentId);
      if (!instanceIds || instanceIds.length === 0) continue;

      // 첫 번째 인스턴스의 SVG 추출
      // mergeInstanceVectorSvgs가 실패하면 (absoluteBoundingBox 없음) fallback 사용
      const firstInstanceId = instanceIds[0];
      const mergedSvg =
        this.specDataManager.mergeInstanceVectorSvgs(firstInstanceId) ||
        this.specDataManager.getFirstVectorSvgByInstanceId(firstInstanceId);

      if (mergedSvg) {
        svgByVariantName[variantName] = mergedSvg;
      }
    }

    return svgByVariantName;
  }

  /**
   * dependency 컴포넌트의 루트를 유연하게 만들기 (width/height를 100%로 설정)
   * 사용하는 곳(INSTANCE)의 wrapper가 크기와 padding을 제공하고, 컴포넌트는 그 안을 채움
   *
   * 제거하는 스타일:
   * - 크기: width, height → 100%로 대체
   * - 패딩: padding (모든 방향)
   * - 시각적 스타일: background, border-radius, border, opacity
   *   (wrapper(INSTANCE)가 시각적 스타일을 담당하므로 dependency에서는 제거)
   */
  public makeRootFlexible(variant: FigmaNodeData): FigmaNodeData {
    if (!variant.styleTree?.cssStyle) {
      return variant;
    }

    // 크기/패딩/시각적 스타일 제거하고 100%로 대체
    // wrapper에서 이미 이 스타일들을 적용하므로 dependency에서는 제거
    const {
      // 크기 관련
      width: _width,
      height: _height,
      // 패딩 관련
      padding: _padding,
      "padding-top": _paddingTop,
      "padding-right": _paddingRight,
      "padding-bottom": _paddingBottom,
      "padding-left": _paddingLeft,
      // 시각적 스타일 (wrapper가 담당)
      background: _background,
      "border-radius": _borderRadius,
      border: _border,
      opacity: _opacity,
      ...restCssStyle
    } = variant.styleTree.cssStyle;

    // 자식 중 position: absolute가 있는지 확인
    // 있으면 부모에 position: relative를 추가해야 함
    const hasAbsoluteChild = this._hasAbsolutePositionedChild(
      variant.styleTree.children || []
    );

    // 브라우저 기본 배경색(button 등)을 무력화하기 위해 항상 background: transparent 추가
    // wrapper가 시각적 스타일(background, opacity 등)을 담당하므로, 내부 요소는 투명해야 함
    return {
      ...variant,
      styleTree: {
        ...variant.styleTree,
        cssStyle: {
          ...restCssStyle,
          width: "100%",
          height: "100%",
          background: "transparent",
          // 자식 중 absolute positioned가 있으면 position: relative 추가
          ...(hasAbsoluteChild && { position: "relative" }),
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

  /**
   * 자식 styleTree 중 position: absolute가 있는지 재귀적으로 확인
   * 있으면 부모에 position: relative가 필요함
   */
  private _hasAbsolutePositionedChild(children: any[]): boolean {
    for (const child of children) {
      if (child.cssStyle?.position === "absolute") {
        return true;
      }
      // 자식의 자식은 확인하지 않음 - 직접 자식만 확인
      // (재귀적으로 확인하면 손자 absolute도 잡히는데, 그건 자식이 처리해야 함)
    }
    return false;
  }
}

export default VariantEnrichManager;
