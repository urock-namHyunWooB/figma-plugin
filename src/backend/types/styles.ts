import {
  VectorPaths,
  Paint,
  Effect,
  Constraints as FigmaConstraints,
  Vector,
  BlendMode,
  StrokeCap,
  StrokeJoin,
} from "@figma/plugin-typings/plugin-api-standalone";

/**
 * Padding 타입 정의
 */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Margin 타입 정의
 */
export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 변환된 RGB 색상 타입 (0-255 범위)
 * Figma의 RGB는 0-1 범위이지만, 추출 시 0-255로 변환
 */
export interface ConvertedRGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

/**
 * 변환된 RGBA 색상 타입
 */
export interface ConvertedRGBA extends ConvertedRGB {
  a?: number;
}

/**
 * 변환된 Fill 정보 타입
 * Figma의 Paint를 변환한 형태
 */
export interface ConvertedFill {
  type: Paint["type"];
  color?: ConvertedRGB;
  opacity?: number;
}

/**
 * 변환된 Stroke 정보 타입
 * Figma의 Paint를 변환한 형태
 */
export interface ConvertedStroke {
  type: Paint["type"];
  color?: ConvertedRGB;
}

/**
 * 변환된 Effect 정보 타입
 * Figma의 Effect를 변환한 형태
 */
export interface ConvertedEffect {
  type: Effect["type"];
  visible: boolean;
  radius?: number;
  offset?: Vector;
  color?: ConvertedRGBA;
  spread?: number;
  blur?: number;
}

/**
 * 공통 스타일 프로퍼티 타입
 * Figma 타입을 최대한 활용하되, 변환이 필요한 부분만 별도 타입 사용
 */

//TODO 피그마 타입 활용
export interface BaseStyleProperties {
  x?: number;
  y?: number;
  rotation?: number;
  visible?: boolean;
  locked?: boolean;
  padding?: Padding;
  margin?: Margin;
  fills?: ConvertedFill[];
  strokes?: ConvertedStroke[];
  strokeWeight?: number;
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  strokeCap?: StrokeCap;
  strokeJoin?: StrokeJoin;
  strokeMiterLimit?: number;
  strokeDashes?: number[];
  fillGeometry?: VectorPaths;
  strokeGeometry?: VectorPaths;
  cornerRadius?: number;
  effects?: ConvertedEffect[];
  opacity?: number;
  blendMode?: BlendMode;
  constraints?: FigmaConstraints;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";
  itemSpacing?: number;
  layoutGrow?: number;
  layoutAlign?: "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  overflow?: "VISIBLE" | "HIDDEN";
  clipsContent?: boolean;
}
