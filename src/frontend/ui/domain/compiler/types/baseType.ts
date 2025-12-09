/**
 * Figma REST API JSON_REST_V1 타입 정의
 *
 * exportAsync({ format: 'JSON_REST_V1' })의 반환 타입
 * Figma Plugin API 타입을 최대한 활용하여 정의
 */
import { BaseStyleProperties } from "@backend";
import type {
  Paint,
  Effect,
  BlendMode,
  StrokeCap,
  StrokeJoin,
  ComponentSetNode,
} from "@figma/plugin-typings/plugin-api-standalone";

/**
 * Layout Mode 타입 (Figma API에서 직접 export되지 않아 직접 정의)
 */
export type RestLayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";

/**
 * Primary Axis Align Items 타입
 */
export type RestPrimaryAxisAlignItems =
  | "MIN"
  | "CENTER"
  | "MAX"
  | "SPACE_BETWEEN";

/**
 * Counter Axis Align Items 타입
 * Figma API: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE'
 */
export type RestCounterAxisAlignItems = "MIN" | "MAX" | "CENTER" | "BASELINE";

/**
 * Primary Axis Sizing Mode 타입
 */
export type RestPrimaryAxisSizingMode = "FIXED" | "AUTO";

/**
 * Counter Axis Sizing Mode 타입
 */
export type RestCounterAxisSizingMode = "FIXED" | "AUTO";

/**
 * Layout Sizing 타입
 */
export type RestLayoutSizing = "FIXED" | "HUG" | "FILL";

/**
 * Layout Align 타입
 */
export type RestLayoutAlign = "INHERIT" | "STRETCH" | "MIN" | "CENTER" | "MAX";

export interface StyleTree {
  id: string;
  name: string;
  cssStyle: { [p: string]: string };
  children: StyleTree[];
}

export interface FigmaNodeData {
  pluginData: {
    key: string;
    value: string;
  }[];
  info: FigmaRestApiResponse;
  styleTree: StyleTree;
}

/**
 * REST API 응답의 최상위 구조
 */
export interface FigmaRestApiResponse {
  document: SceneNode;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
  styles: Record<string, StyleMetadata>;
  schemaVersion: number;
}

/**
 * Style 메타데이터 (styles 맵의 값)
 */
export interface StyleMetadata {
  key: string;
  name: string;
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
  remote?: boolean;
  description?: string;
}

/**
 * Interaction (프로토타이핑 상호작용)
 */
export interface RestInteraction {
  action?: {
    type: string;
    [key: string]: any;
  };
  trigger?: {
    type: string;
    [key: string]: any;
  };
}

/**
 * REST API 노드의 기본 속성
 * Figma Plugin API의 노드 타입과 유사하지만 JSON 직렬화된 형태
 */
export interface FigmaRestNodeBase {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  children?: FigmaRestNode[];
  interactions?: RestInteraction[];
}

/**
 * Bounding Box (절대 좌표)
 */
export interface AbsoluteBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Render Bounds (렌더링 경계)
 */
export interface AbsoluteRenderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Constraints (제약 조건)
 */
export interface RestConstraints {
  vertical: "TOP" | "BOTTOM" | "CENTER" | "TOP_BOTTOM" | "SCALE";
  horizontal: "LEFT" | "RIGHT" | "CENTER" | "LEFT_RIGHT" | "SCALE";
}

/**
 * Color (RGB, 0-1 범위)
 */
export interface RestColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Paint (Figma Paint 타입 기반, JSON 직렬화된 형태)
 */
export interface RestPaint {
  type: Paint["type"];
  blendMode?: BlendMode;
  color?: RestColor;
  opacity?: number;
  gradientStops?: any[];
  gradientTransform?: any;
  imageRef?: string;
  imageHash?: string;
  scaleMode?: string;
  imageTransform?: any;
  visible?: boolean;
}

/**
 * Effect (Figma Effect 타입 기반, JSON 직렬화된 형태)
 */
export interface RestEffect {
  type: Effect["type"];
  visible?: boolean;
  radius?: number;
  color?: RestColor;
  offset?: { x: number; y: number };
  spread?: number;
  showShadowBehindNode?: boolean;
}

/**
 * Text Style (텍스트 스타일)
 */
export interface RestTextStyle {
  fontFamily: string;
  fontPostScriptName?: string;
  fontStyle?: string;
  fontWeight: number;
  textAutoResize?: "WIDTH_AND_HEIGHT" | "HEIGHT" | "NONE" | "TRUNCATE";
  fontSize: number;
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  letterSpacing?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  lineHeightPercentFontSize?: number;
  lineHeightUnit?: "PIXELS" | "FONT_SIZE_%" | "INTRINSIC_%";
}

/**
 * COMPONENT_SET 노드
 */
export interface FigmaRestComponentSetNode extends ComponentSetNode {}

/**
 * COMPONENT 노드
 */
export interface FigmaRestComponentNode extends FigmaRestNodeBase {
  type: "COMPONENT";
  scrollBehavior?: "SCROLLS" | "FIXED";
  absoluteBoundingBox?: AbsoluteBoundingBox;
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  constraints?: RestConstraints;
  clipsContent?: boolean;
  background?: RestPaint[];
  backgroundColor?: RestColor;
  fills?: RestPaint[];
  strokes?: RestPaint[];
  strokeWeight?: number;
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  strokeCap?: StrokeCap;
  strokeJoin?: StrokeJoin;
  strokeMiterLimit?: number;
  cornerRadius?: number;
  cornerSmoothing?: number;
  layoutMode?: RestLayoutMode;
  primaryAxisAlignItems?: RestPrimaryAxisAlignItems;
  counterAxisAlignItems?: RestCounterAxisAlignItems;
  primaryAxisSizingMode?: RestPrimaryAxisSizingMode;
  counterAxisSizingMode?: RestCounterAxisSizingMode;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  layoutWrap?: "NO_WRAP" | "WRAP";
  layoutSizingHorizontal?: RestLayoutSizing;
  layoutSizingVertical?: RestLayoutSizing;
  layoutGrow?: number;
  layoutAlign?: RestLayoutAlign;
  effects?: RestEffect[];
  blendMode?: BlendMode;
  styles?: Record<string, string>; // style ID 참조
}

/**
 * TEXT 노드
 */
export interface FigmaRestTextNode extends FigmaRestNodeBase {
  type: "TEXT";
  scrollBehavior?: "SCROLLS" | "FIXED";
  absoluteBoundingBox?: AbsoluteBoundingBox;
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  constraints?: RestConstraints;
  fills?: RestPaint[];
  strokes?: RestPaint[];
  strokeWeight?: number;
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  characters?: string;
  style?: RestTextStyle;
  characterStyleOverrides?: number[];
  styleOverrideTable?: Record<number, Partial<RestTextStyle>>;
  lineTypes?: string[];
  lineIndentations?: number[];
  layoutVersion?: number;
  effects?: RestEffect[];
  blendMode?: BlendMode;
  styles?: Record<string, string>; // style ID 참조
  layoutAlign?: RestLayoutAlign;
  layoutGrow?: number;
  layoutSizingHorizontal?: RestLayoutSizing;
  layoutSizingVertical?: RestLayoutSizing;
}

/**
 * FRAME 노드
 */
export interface FigmaRestFrameNode extends FigmaRestNodeBase {
  type: "FRAME";
  scrollBehavior?: "SCROLLS" | "FIXED";
  absoluteBoundingBox?: AbsoluteBoundingBox;
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  constraints?: RestConstraints;
  clipsContent?: boolean;
  background?: RestPaint[];
  backgroundColor?: RestColor;
  fills?: RestPaint[];
  strokes?: RestPaint[];
  strokeWeight?: number;
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  cornerRadius?: number;
  cornerSmoothing?: number;
  layoutMode?: RestLayoutMode;
  primaryAxisAlignItems?: RestPrimaryAxisAlignItems;
  counterAxisAlignItems?: RestCounterAxisAlignItems;
  primaryAxisSizingMode?: RestPrimaryAxisSizingMode;
  counterAxisSizingMode?: RestCounterAxisSizingMode;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  layoutWrap?: "NO_WRAP" | "WRAP";
  layoutSizingHorizontal?: RestLayoutSizing;
  layoutSizingVertical?: RestLayoutSizing;
  effects?: RestEffect[];
  blendMode?: BlendMode;
  styles?: Record<string, string>; // style ID 참조
}

/**
 * 기타 노드 타입들 (LINE, RECTANGLE, VECTOR, ELLIPSE 등)
 */
export interface FigmaRestOtherNode extends FigmaRestNodeBase {
  type:
    | "LINE"
    | "RECTANGLE"
    | "VECTOR"
    | "ELLIPSE"
    | "STAR"
    | "POLYGON"
    | "GROUP"
    | "INSTANCE"
    | "BOOLEAN_OPERATION"
    | "SECTION"
    | "SLICE"
    | "STICKY"
    | "SHAPE_WITH_TEXT"
    | "CONNECTOR"
    | "WASHI_TAPE";
  scrollBehavior?: "SCROLLS" | "FIXED";
  absoluteBoundingBox?: AbsoluteBoundingBox;
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  constraints?: RestConstraints;
  fills?: RestPaint[];
  strokes?: RestPaint[];
  strokeWeight?: number;
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  strokeCap?: StrokeCap;
  strokeJoin?: StrokeJoin;
  strokeMiterLimit?: number;
  cornerRadius?: number;
  cornerSmoothing?: number;
  effects?: RestEffect[];
  blendMode?: BlendMode;
  layoutAlign?: RestLayoutAlign;
  layoutGrow?: number;
  layoutSizingHorizontal?: RestLayoutSizing;
  layoutSizingVertical?: RestLayoutSizing;
  styles?: Record<string, string>; // style ID 참조
}

/**
 * 모든 REST API 노드 타입의 유니온
 */
export type FigmaRestNode =
  | FigmaRestComponentSetNode
  | FigmaRestComponentNode
  | FigmaRestTextNode
  | FigmaRestFrameNode
  | FigmaRestOtherNode;
