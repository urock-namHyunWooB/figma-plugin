/**
 * 스타일 정리 로직을 담당하는 클래스
 */
export class StyleCleaner {
  /**
   * 스타일 객체를 정리하여 반환
   */
  public cleanStyle(style: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = { ...style };

    this.removeDefaultOpacity(cleaned);
    this.removeZeroPadding(cleaned);
    this.roundNumericValues(cleaned);

    return cleaned;
  }

  /**
   * 기본 opacity 값(1) 제거
   */
  private removeDefaultOpacity(style: Record<string, any>): void {
    if (style.opacity === 1) {
      delete style.opacity;
    }
  }

  /**
   * 0 padding 값 제거
   */
  private removeZeroPadding(style: Record<string, any>): void {
    if (
      typeof style.padding === "string" &&
      this.isZeroPadding(style.padding)
    ) {
      delete style.padding;
    }
  }

  /**
   * padding이 "0px 0px 0px 0px" 형식인지 확인
   */
  private isZeroPadding(padding: string): boolean {
    return padding.replace(/\s+/g, "") === "0px0px0px0px";
  }

  /**
   * 숫자 값들을 소수점 둘째 자리까지 반올림
   */
  private roundNumericValues(style: Record<string, any>): void {
    for (const key of Object.keys(style)) {
      const value = style[key];
      if (typeof value === "number") {
        style[key] = Math.round(value * 100) / 100;
      }
    }
  }
}

