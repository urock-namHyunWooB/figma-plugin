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
  visible?: boolean;
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
 * Figma Auto Layout 관련 타입 정의
 * @figma/plugin-typings에서 직접 export되지 않지만, 실제 Figma API에서 사용되는 타입들
 */
export type LayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
export type PrimaryAxisSizingMode = "FIXED" | "AUTO";
export type CounterAxisSizingMode = "FIXED" | "AUTO";
export type PrimaryAxisAlignItems = "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
export type CounterAxisAlignItems = "MIN" | "CENTER" | "MAX" | "BASELINE";
export type LayoutAlign = "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT";
export type LayoutSizing = "FIXED" | "HUG" | "FILL";
export type OverflowDirection = "VISIBLE" | "HIDDEN";

/**
 * 공통 스타일 프로퍼티 타입
 * Figma 타입을 최대한 활용하되, 변환이 필요한 부분만 별도 타입 사용
 * 실제 추출되는 값들을 반영하여 정의
 */
export interface BaseStyleProperties {
  // 위치 및 변환
  x?: number;
  y?: number;
  rotation?: number;
  visible?: boolean;
  locked?: boolean;

  // 크기
  width?: number;
  height?: number;

  // Padding (Figma에서는 개별 속성으로 제공되지만, 객체 형태로도 변환 가능)
  padding?: Padding;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

  // Margin (커스텀 타입, Figma에 없는 개념)
  margin?: Margin;

  // Fill & Stroke (Figma Paint 타입 활용)
  fills?: ConvertedFill[];
  fills_count?: number; // 메타데이터: fills 배열의 길이
  strokes?: ConvertedStroke[];
  strokes_count?: number; // 메타데이터: strokes 배열의 길이
  strokeWeight?: number | typeof figma.mixed;
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  strokeCap?: typeof figma.mixed | StrokeCap;
  strokeJoin?: StrokeJoin;
  strokeMiterLimit?: number;
  strokeDashes?: number[];
  fillGeometry?: VectorPaths;
  strokeGeometry?: VectorPaths;
  strokeGeometry_length?: number; // 메타데이터: strokeGeometry 배열의 길이

  // 모양
  cornerRadius?: number;

  // Effects (Figma Effect 타입 활용)
  effects?: ConvertedEffect[];

  // 렌더링
  opacity?: number;
  blendMode?: BlendMode;

  // Constraints (Figma Constraints 타입 활용)
  constraints?: FigmaConstraints;

  // Auto Layout (Figma Layout 타입 기반)
  layoutMode?: LayoutMode;
  primaryAxisSizingMode?: PrimaryAxisSizingMode;
  counterAxisSizingMode?: CounterAxisSizingMode;
  primaryAxisAlignItems?: PrimaryAxisAlignItems;
  counterAxisAlignItems?: CounterAxisAlignItems;
  itemSpacing?: number;

  // Layout Child Properties (Figma Layout 타입 기반)
  layoutGrow?: number;
  layoutAlign?: LayoutAlign;
  layoutSizingHorizontal?: LayoutSizing;
  layoutSizingVertical?: LayoutSizing;

  // Overflow (Figma OverflowDirection 타입 기반)
  overflow?: OverflowDirection;
  clipsContent?: boolean;
}
