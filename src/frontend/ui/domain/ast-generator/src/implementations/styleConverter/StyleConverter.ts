import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import type { IStyleConverter } from "../../interfaces/IStyleConverter";

import { CommonConverter } from "@frontend/ui/domain/ast-generator/src/implementations/StyleConverter/CommonConverter";
import { TextStyleConverter } from "@frontend/ui/domain/ast-generator/src/implementations/StyleConverter/TextStyleConverter";
import { Converter } from "@frontend/ui/domain/ast-generator/src/implementations/StyleConverter/Converter";

/**
 * Layout 노드를 스타일 객체로 변환하는 기본 구현체
 */
class StyleConverter implements IStyleConverter {
  private readonly registry = new Map<string, Converter>();
  private readonly fallbackConverter: Converter;

  constructor(
    customRegistry?: Record<string, Converter>,
    fallbackConverter: Converter = new CommonConverter(),
  ) {
    this.fallbackConverter = fallbackConverter;

    if (customRegistry) {
      Object.entries(customRegistry).forEach(([figmaType, converter]) => {
        this.registerConverter(figmaType, converter);
      });
    }
  }

  public registerConverter(figmaType: string, converter: Converter): void {
    if (!figmaType || !converter) {
      return;
    }

    this.registry.set(figmaType.toUpperCase(), converter);
  }

  private resolveConverter(figmaType: string | undefined): Converter {
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

export const styleConverter = new StyleConverter({
  TEXT: new TextStyleConverter(),
});
