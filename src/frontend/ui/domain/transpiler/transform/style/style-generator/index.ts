import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";

import { CommonGen } from "./CommonGen";
import { Generator } from "./Generator";
import { TextStyleGen } from "./TextStyleGen";
import { IStyleConverter } from "../../../types";

/**
 * Layout 노드를 스타일 객체로 변환하는 기본 구현체
 */
class StyleConverter implements IStyleConverter {
  private readonly registry = new Map<string, Generator>();
  private readonly fallbackConverter: Generator;

  constructor(
    customRegistry?: Record<string, Generator>,
    fallbackConverter: Generator = new CommonGen(),
  ) {
    this.fallbackConverter = fallbackConverter;

    if (customRegistry) {
      Object.entries(customRegistry).forEach(([figmaType, converter]) => {
        this.registerConverter(figmaType, converter);
      });
    }
  }

  public registerConverter(figmaType: string, converter: Generator): void {
    if (!figmaType || !converter) {
      return;
    }

    this.registry.set(figmaType.toUpperCase(), converter);
  }

  private resolveConverter(figmaType: string | undefined): Generator {
    if (!figmaType) {
      return this.fallbackConverter;
    }

    const registered = this.registry.get(figmaType.toUpperCase());
    return registered ?? this.fallbackConverter;
  }

  /**
   * Layout 노드를 CSS 스타일 객체로 변환
   *
   * 변환 과정:
   * 1. 크기 정보 (width, height)
   * 2. 색상 정보 (fills에서 추출)
   * 3. 투명도 정보 (opacity)
   * 4. 패딩 정보 (padding)
   */
  public layoutNodeToStyle(
    node: LayoutTreeNode | undefined,
    figmaType: string,
  ) {
    if (!node) {
      return {};
    }

    const converter = this.resolveConverter(figmaType);
    return converter.convert({}, node, figmaType);
  }
}

export const styleConverter = new StyleConverter();
export { Generator, CommonGen, TextStyleGen };

