import {
  BaseStyleProperties,
  ConvertedFill,
  ConvertedStroke,
  ConvertedEffect,
} from "@backend/types/styles";

/**
 * CSS 스타일 객체 타입
 */
export interface CssStyleObject {
  [key: string]: string | number | undefined;
}

/**
 * Figma 스타일 데이터를 CSS 스타일 객체로 변환
 * @param styles Figma 스타일 데이터 (BaseStyleProperties)
 * @returns CSS 스타일 객체
 */
export function figmaStyleToCss(styles: BaseStyleProperties): CssStyleObject {
  const css: CssStyleObject = {};

  // 가시성 처리
  if (styles.visible === false) {
    css.display = "none";
    return css; // visible이 false면 다른 스타일은 무의미
  }

  // 배경색 (fills)
  _fill(css, styles);

  // 테두리 (strokes)
  if (styles.strokes && styles.strokes.length > 0) {
    const solidStroke = styles.strokes.find(
      (stroke) => stroke.type === "SOLID" && stroke.color
    );
    if (solidStroke) {
      const stroke = solidStroke as ConvertedStroke;
      css.borderColor = `rgb(${stroke.color!.r}, ${stroke.color!.g}, ${stroke.color!.b})`;
    }
  }

  // 테두리 두께
  _border(css, styles);
  // 테두리 정렬 (strokeAlign)
  if (styles.strokeAlign) {
    // CSS에서는 strokeAlign을 직접 지원하지 않으므로
    // OUTSIDE의 경우 box-shadow로 시뮬레이션하거나 무시
    // INSIDE는 border로 처리
    if (styles.strokeAlign === "INSIDE") {
      css.boxSizing = "border-box";
    }
  }

  // 테두리 모서리 스타일
  if (styles.strokeCap) {
    // strokeCap은 SVG에서만 사용되므로 CSS에서는 무시
  }

  if (styles.strokeJoin) {
    // strokeJoin도 SVG에서만 사용되므로 CSS에서는 무시
  }

  // 테두리 점선
  if (styles.strokeDashes && styles.strokeDashes.length > 0) {
    css.borderStyle = "dashed";
    css.borderDashArray = styles.strokeDashes.join(" ");
  }

  // 모서리 둥글기
  if (styles.cornerRadius !== undefined && styles.cornerRadius > 0) {
    css.borderRadius = `${styles.cornerRadius}px`;
  }

  // 패딩
  if (styles.padding) {
    const { top, right, bottom, left } = styles.padding;
    if (top === right && right === bottom && bottom === left) {
      css.padding = `${top}px`;
    } else if (top === bottom && left === right) {
      css.padding = `${top}px ${right}px`;
    } else {
      css.padding = `${top}px ${right}px ${bottom}px ${left}px`;
    }
  }

  // 마진
  if (styles.margin) {
    const { top, right, bottom, left } = styles.margin;
    if (top === right && right === bottom && bottom === left) {
      css.margin = `${top}px`;
    } else if (top === bottom && left === right) {
      css.margin = `${top}px ${right}px`;
    } else {
      css.margin = `${top}px ${right}px ${bottom}px ${left}px`;
    }
  }

  // 투명도
  if (styles.opacity !== undefined && styles.opacity < 1) {
    css.opacity = styles.opacity;
  }

  // 회전
  if (styles.rotation !== undefined && styles.rotation !== 0) {
    const degrees = (styles.rotation * 180) / Math.PI;
    css.transform = `rotate(${degrees}deg)`;
  }

  // Flexbox 레이아웃 (Auto Layout)
  if (styles.layoutMode && styles.layoutMode !== "NONE") {
    css.display = "flex";
    css.flexDirection = styles.layoutMode === "HORIZONTAL" ? "row" : "column";

    // justify-content (primaryAxisAlignItems)
    if (styles.primaryAxisAlignItems) {
      switch (styles.primaryAxisAlignItems) {
        case "MIN":
          css.justifyContent = "flex-start";
          break;
        case "CENTER":
          css.justifyContent = "center";
          break;
        case "MAX":
          css.justifyContent = "flex-end";
          break;
        case "SPACE_BETWEEN":
          css.justifyContent = "space-between";
          break;
      }
    }

    // align-items (counterAxisAlignItems)
    if (styles.counterAxisAlignItems) {
      switch (styles.counterAxisAlignItems) {
        case "MIN":
          css.alignItems = "flex-start";
          break;
        case "CENTER":
          css.alignItems = "center";
          break;
        case "MAX":
          css.alignItems = "flex-end";
          break;
        case "BASELINE":
          css.alignItems = "baseline";
          break;
      }
    }

    // gap (itemSpacing)
    if (styles.itemSpacing !== undefined && styles.itemSpacing > 0) {
      css.gap = `${styles.itemSpacing}px`;
    }
  }

  // Flex grow
  if (styles.layoutGrow !== undefined && styles.layoutGrow > 0) {
    css.flexGrow = styles.layoutGrow;
  }

  // Flex sizing
  if (styles.layoutSizingHorizontal) {
    if (styles.layoutSizingHorizontal === "FILL") {
      css.width = "100%";
    } else if (styles.layoutSizingHorizontal === "HUG" && styles.width) {
      css.width = `${styles.width}px`;
    }
  }

  if (styles.layoutSizingVertical) {
    if (styles.layoutSizingVertical === "FILL") {
      css.height = "100%";
    } else if (styles.layoutSizingVertical === "HUG" && styles.height) {
      css.height = `${styles.height}px`;
    }
  }

  // Overflow
  if (styles.overflow) {
    css.overflow = styles.overflow === "HIDDEN" ? "hidden" : "visible";
  }

  // Clips content
  if (styles.clipsContent === true) {
    css.overflow = "hidden";
  }

  // Effects (그림자, 블러 등)
  if (styles.effects && styles.effects.length > 0) {
    const shadows: string[] = [];
    let blurFilter = "";

    for (const effect of styles.effects) {
      if (!effect.visible) continue;

      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        const shadow = effect as ConvertedEffect;
        if (shadow.color && shadow.offset && shadow.radius !== undefined) {
          const x = shadow.offset.x ?? 0;
          const y = shadow.offset.y ?? 0;
          const radius = shadow.radius;
          const spread = shadow.spread ?? 0;
          const color = shadow.color;
          const alpha = color.a ?? 1;

          const shadowValue = `${x}px ${y}px ${radius}px ${spread}px rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

          if (effect.type === "INNER_SHADOW") {
            shadows.push(`inset ${shadowValue}`);
          } else {
            shadows.push(shadowValue);
          }
        }
      } else if (
        effect.type === "LAYER_BLUR" ||
        effect.type === "BACKGROUND_BLUR"
      ) {
        const blur = effect as ConvertedEffect;
        if (blur.radius !== undefined) {
          blurFilter = `blur(${blur.radius}px)`;
        }
      }
    }

    if (shadows.length > 0) {
      css.boxShadow = shadows.join(", ");
    }

    if (blurFilter) {
      css.filter = blurFilter;
    }
  }

  return css;
}

const _border = (css: CssStyleObject, styles: BaseStyleProperties) => {
  if (
    styles.strokeWeight !== undefined &&
    typeof styles.strokeWeight === "number" &&
    styles.strokeWeight > 0 &&
    styles.strokeGeometry?.length &&
    styles.strokeGeometry?.length > 0
  ) {
    css.borderWidth = `${styles.strokeWeight}px`;

    if (!css.borderStyle) {
      css.borderStyle = "solid";
    }
  } else {
    css.border = "none";
  }
};

const _fill = (css: CssStyleObject, styles: BaseStyleProperties) => {
  if (styles.fills && styles.fills.length > 0) {
    const solidFill = styles.fills.find(
      (fill) => fill.type === "SOLID" && fill.color
    );

    if (solidFill) {
      const fill = solidFill as ConvertedFill;
      const color = fill.color!;
      const opacity = fill.opacity ?? 1;
      const visible = fill.visible ?? true;

      if (!visible) {
        return;
      }

      if (opacity < 1) {
        css.backgroundColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
      } else {
        css.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
      }
    }
  }
};
