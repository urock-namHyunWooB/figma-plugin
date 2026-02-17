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

/**
 * 스타일 트리 인터페이스
 * 노드의 CSS 스타일 정보를 계층적으로 표현
 */
export interface StyleTree {
  /** 노드 ID */
  id: string;
  /** 노드 이름 */
  name: string;
  /** CSS 스타일 속성 맵 */
  cssStyle: { [p: string]: string };
  /** 자식 스타일 트리 배열 */
  children: StyleTree[];
}

/**
 * Figma 노드 데이터 인터페이스
 * 플러그인에서 추출한 Figma 노드의 전체 정보
 */
export interface FigmaNodeData {
  /** 플러그인 데이터 배열 */
  pluginData: {
    key: string;
    value: string;
  }[];
  /** REST API 응답 정보 */
  info: FigmaRestApiResponse;
  /** 스타일 트리 */
  styleTree: StyleTree;
  /**
   * INSTANCE 노드가 참조하는 원본 컴포넌트 데이터
   * key: componentId, value: 원본 컴포넌트의 FigmaNodeData
   */
  dependencies?: Record<string, FigmaNodeData>;
  /**
   * 이미지 URL 맵
   * key: imageRef (Figma 이미지 해시), value: 실제 이미지 URL
   */
  imageUrls?: Record<string, string>;
  /**
   * VECTOR SVG 맵
   * key: nodeId, value: SVG 문자열
   */
  vectorSvgs?: Record<string, string>;
}

/**
 * REST API 응답의 최상위 구조
 */
export interface FigmaRestApiResponse {
  /** 문서 루트 노드 */
  document: SceneNode;
  /** 컴포넌트 정보 맵 */
  components: Record<string, unknown>;
  /** 컴포넌트 세트 정보 맵 */
  componentSets: Record<string, unknown>;
  /** 스타일 메타데이터 맵 */
  styles: Record<string, StyleMetadata>;
  /** 스키마 버전 */
  schemaVersion: number;
}

/**
 * Style 메타데이터 (styles 맵의 값)
 */
export interface StyleMetadata {
  /** 스타일 고유 키 */
  key: string;
  /** 스타일 이름 */
  name: string;
  /** 스타일 타입 */
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
  /** 원격 스타일 여부 */
  remote?: boolean;
  /** 스타일 설명 */
  description?: string;
}

/**
 * Interaction (프로토타이핑 상호작용)
 */
export interface RestInteraction {
  /** 액션 정보 */
  action?: {
    type: string;
    [key: string]: any;
  };
  /** 트리거 정보 */
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
  /** 노드 ID */
  id: string;
  /** 노드 이름 */
  name: string;
  /** 노드 타입 */
  type: string;
  /** 가시성 여부 */
  visible?: boolean;
  /** 잠금 여부 */
  locked?: boolean;
  /** 불투명도 (0-1) */
  opacity?: number;
  /** 자식 노드 배열 */
  children?: FigmaRestNode[];
  /** 인터랙션 배열 */
  interactions?: RestInteraction[];
}

/**
 * Bounding Box (절대 좌표)
 */
export interface AbsoluteBoundingBox {
  /** X 좌표 */
  x: number;
  /** Y 좌표 */
  y: number;
  /** 너비 */
  width: number;
  /** 높이 */
  height: number;
}

/**
 * Render Bounds (렌더링 경계)
 */
export interface AbsoluteRenderBounds {
  /** X 좌표 */
  x: number;
  /** Y 좌표 */
  y: number;
  /** 너비 */
  width: number;
  /** 높이 */
  height: number;
}

/**
 * Constraints (제약 조건)
 */
export interface RestConstraints {
  /** 수직 제약 */
  vertical: "TOP" | "BOTTOM" | "CENTER" | "TOP_BOTTOM" | "SCALE";
  /** 수평 제약 */
  horizontal: "LEFT" | "RIGHT" | "CENTER" | "LEFT_RIGHT" | "SCALE";
}

/**
 * Color (RGB, 0-1 범위)
 */
export interface RestColor {
  /** 빨강 (0-1) */
  r: number;
  /** 초록 (0-1) */
  g: number;
  /** 파랑 (0-1) */
  b: number;
  /** 알파/투명도 (0-1) */
  a?: number;
}

/**
 * Paint (Figma Paint 타입 기반, JSON 직렬화된 형태)
 */
export interface RestPaint {
  /** 페인트 타입 */
  type: Paint["type"];
  /** 블렌드 모드 */
  blendMode?: BlendMode;
  /** 단색 색상 */
  color?: RestColor;
  /** 불투명도 */
  opacity?: number;
  /** 그라디언트 정지점 배열 */
  gradientStops?: any[];
  /** 그라디언트 변환 행렬 */
  gradientTransform?: any;
  /** 이미지 참조 */
  imageRef?: string;
  /** 이미지 해시 */
  imageHash?: string;
  /** 이미지 스케일 모드 */
  scaleMode?: string;
  /** 이미지 변환 행렬 */
  imageTransform?: any;
  /** 가시성 여부 */
  visible?: boolean;
}

/**
 * Effect (Figma Effect 타입 기반, JSON 직렬화된 형태)
 */
export interface RestEffect {
  /** 효과 타입 */
  type: Effect["type"];
  /** 가시성 여부 */
  visible?: boolean;
  /** 블러 반경 */
  radius?: number;
  /** 효과 색상 */
  color?: RestColor;
  /** 그림자 오프셋 */
  offset?: { x: number; y: number };
  /** 그림자 확산 */
  spread?: number;
  /** 노드 뒤에 그림자 표시 여부 */
  showShadowBehindNode?: boolean;
}

/**
 * Text Style (텍스트 스타일)
 */
export interface RestTextStyle {
  /** 폰트 패밀리 */
  fontFamily: string;
  /** 폰트 PostScript 이름 */
  fontPostScriptName?: string;
  /** 폰트 스타일 (예: "Bold", "Italic") */
  fontStyle?: string;
  /** 폰트 굵기 (100-900) */
  fontWeight: number;
  /** 텍스트 자동 크기 조절 모드 */
  textAutoResize?: "WIDTH_AND_HEIGHT" | "HEIGHT" | "NONE" | "TRUNCATE";
  /** 폰트 크기 (px) */
  fontSize: number;
  /** 텍스트 가로 정렬 */
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  /** 텍스트 세로 정렬 */
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  /** 자간 (px) */
  letterSpacing?: number;
  /** 행간 (px) */
  lineHeightPx?: number;
  /** 행간 (%) */
  lineHeightPercent?: number;
  /** 폰트 크기 기준 행간 (%) */
  lineHeightPercentFontSize?: number;
  /** 행간 단위 */
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
  /** 스크롤 동작 */
  scrollBehavior?: "SCROLLS" | "FIXED";
  /** 절대 바운딩 박스 */
  absoluteBoundingBox?: AbsoluteBoundingBox;
  /** 절대 렌더 바운드 */
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  /** 제약 조건 */
  constraints?: RestConstraints;
  /** 내용 클리핑 여부 */
  clipsContent?: boolean;
  /** 배경 페인트 배열 */
  background?: RestPaint[];
  /** 배경색 */
  backgroundColor?: RestColor;
  /** 채우기 페인트 배열 */
  fills?: RestPaint[];
  /** 테두리 페인트 배열 */
  strokes?: RestPaint[];
  /** 테두리 두께 */
  strokeWeight?: number;
  /** 테두리 정렬 */
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  /** 테두리 끝 모양 */
  strokeCap?: StrokeCap;
  /** 테두리 연결 모양 */
  strokeJoin?: StrokeJoin;
  /** 테두리 마이터 한계 */
  strokeMiterLimit?: number;
  /** 모서리 반경 */
  cornerRadius?: number;
  /** 모서리 부드러움 */
  cornerSmoothing?: number;
  /** 레이아웃 모드 */
  layoutMode?: RestLayoutMode;
  /** 주축 정렬 */
  primaryAxisAlignItems?: RestPrimaryAxisAlignItems;
  /** 교차축 정렬 */
  counterAxisAlignItems?: RestCounterAxisAlignItems;
  /** 주축 크기 모드 */
  primaryAxisSizingMode?: RestPrimaryAxisSizingMode;
  /** 교차축 크기 모드 */
  counterAxisSizingMode?: RestCounterAxisSizingMode;
  /** 왼쪽 패딩 */
  paddingLeft?: number;
  /** 오른쪽 패딩 */
  paddingRight?: number;
  /** 위쪽 패딩 */
  paddingTop?: number;
  /** 아래쪽 패딩 */
  paddingBottom?: number;
  /** 아이템 간격 */
  itemSpacing?: number;
  /** 레이아웃 줄바꿈 */
  layoutWrap?: "NO_WRAP" | "WRAP";
  /** 가로 크기 조절 */
  layoutSizingHorizontal?: RestLayoutSizing;
  /** 세로 크기 조절 */
  layoutSizingVertical?: RestLayoutSizing;
  /** 레이아웃 성장 비율 */
  layoutGrow?: number;
  /** 레이아웃 정렬 */
  layoutAlign?: RestLayoutAlign;
  /** 효과 배열 */
  effects?: RestEffect[];
  /** 블렌드 모드 */
  blendMode?: BlendMode;
  /** 스타일 ID 참조 맵 */
  styles?: Record<string, string>;
}

/**
 * TEXT 노드
 */
export interface FigmaRestTextNode extends FigmaRestNodeBase {
  type: "TEXT";
  /** 스크롤 동작 */
  scrollBehavior?: "SCROLLS" | "FIXED";
  /** 절대 바운딩 박스 */
  absoluteBoundingBox?: AbsoluteBoundingBox;
  /** 절대 렌더 바운드 */
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  /** 제약 조건 */
  constraints?: RestConstraints;
  /** 채우기 페인트 배열 */
  fills?: RestPaint[];
  /** 테두리 페인트 배열 */
  strokes?: RestPaint[];
  /** 테두리 두께 */
  strokeWeight?: number;
  /** 테두리 정렬 */
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  /** 텍스트 내용 */
  characters?: string;
  /** 텍스트 스타일 */
  style?: RestTextStyle;
  /** 문자별 스타일 오버라이드 인덱스 배열 */
  characterStyleOverrides?: number[];
  /** 스타일 오버라이드 테이블 (인덱스 → 스타일) */
  styleOverrideTable?: Record<number, Partial<RestTextStyle>>;
  /** 줄 타입 배열 */
  lineTypes?: string[];
  /** 줄 들여쓰기 배열 */
  lineIndentations?: number[];
  /** 레이아웃 버전 */
  layoutVersion?: number;
  /** 효과 배열 */
  effects?: RestEffect[];
  /** 블렌드 모드 */
  blendMode?: BlendMode;
  /** 스타일 ID 참조 맵 */
  styles?: Record<string, string>;
  /** 레이아웃 정렬 */
  layoutAlign?: RestLayoutAlign;
  /** 레이아웃 성장 비율 */
  layoutGrow?: number;
  /** 가로 크기 조절 */
  layoutSizingHorizontal?: RestLayoutSizing;
  /** 세로 크기 조절 */
  layoutSizingVertical?: RestLayoutSizing;
}

/**
 * FRAME 노드
 */
export interface FigmaRestFrameNode extends FigmaRestNodeBase {
  type: "FRAME";
  /** 스크롤 동작 */
  scrollBehavior?: "SCROLLS" | "FIXED";
  /** 절대 바운딩 박스 */
  absoluteBoundingBox?: AbsoluteBoundingBox;
  /** 절대 렌더 바운드 */
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  /** 제약 조건 */
  constraints?: RestConstraints;
  /** 내용 클리핑 여부 */
  clipsContent?: boolean;
  /** 배경 페인트 배열 */
  background?: RestPaint[];
  /** 배경색 */
  backgroundColor?: RestColor;
  /** 채우기 페인트 배열 */
  fills?: RestPaint[];
  /** 테두리 페인트 배열 */
  strokes?: RestPaint[];
  /** 테두리 두께 */
  strokeWeight?: number;
  /** 테두리 정렬 */
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  /** 모서리 반경 */
  cornerRadius?: number;
  /** 모서리 부드러움 */
  cornerSmoothing?: number;
  /** 레이아웃 모드 */
  layoutMode?: RestLayoutMode;
  /** 주축 정렬 */
  primaryAxisAlignItems?: RestPrimaryAxisAlignItems;
  /** 교차축 정렬 */
  counterAxisAlignItems?: RestCounterAxisAlignItems;
  /** 주축 크기 모드 */
  primaryAxisSizingMode?: RestPrimaryAxisSizingMode;
  /** 교차축 크기 모드 */
  counterAxisSizingMode?: RestCounterAxisSizingMode;
  /** 왼쪽 패딩 */
  paddingLeft?: number;
  /** 오른쪽 패딩 */
  paddingRight?: number;
  /** 위쪽 패딩 */
  paddingTop?: number;
  /** 아래쪽 패딩 */
  paddingBottom?: number;
  /** 아이템 간격 */
  itemSpacing?: number;
  /** 레이아웃 줄바꿈 */
  layoutWrap?: "NO_WRAP" | "WRAP";
  /** 가로 크기 조절 */
  layoutSizingHorizontal?: RestLayoutSizing;
  /** 세로 크기 조절 */
  layoutSizingVertical?: RestLayoutSizing;
  /** 효과 배열 */
  effects?: RestEffect[];
  /** 블렌드 모드 */
  blendMode?: BlendMode;
  /** 스타일 ID 참조 맵 */
  styles?: Record<string, string>;
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
  /** 스크롤 동작 */
  scrollBehavior?: "SCROLLS" | "FIXED";
  /** 절대 바운딩 박스 */
  absoluteBoundingBox?: AbsoluteBoundingBox;
  /** 절대 렌더 바운드 */
  absoluteRenderBounds?: AbsoluteRenderBounds | null;
  /** 제약 조건 */
  constraints?: RestConstraints;
  /** 채우기 페인트 배열 */
  fills?: RestPaint[];
  /** 테두리 페인트 배열 */
  strokes?: RestPaint[];
  /** 테두리 두께 */
  strokeWeight?: number;
  /** 테두리 정렬 */
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  /** 테두리 끝 모양 */
  strokeCap?: StrokeCap;
  /** 테두리 연결 모양 */
  strokeJoin?: StrokeJoin;
  /** 테두리 마이터 한계 */
  strokeMiterLimit?: number;
  /** 모서리 반경 */
  cornerRadius?: number;
  /** 모서리 부드러움 */
  cornerSmoothing?: number;
  /** 효과 배열 */
  effects?: RestEffect[];
  /** 블렌드 모드 */
  blendMode?: BlendMode;
  /** 레이아웃 정렬 */
  layoutAlign?: RestLayoutAlign;
  /** 레이아웃 성장 비율 */
  layoutGrow?: number;
  /** 가로 크기 조절 */
  layoutSizingHorizontal?: RestLayoutSizing;
  /** 세로 크기 조절 */
  layoutSizingVertical?: RestLayoutSizing;
  /** 스타일 ID 참조 맵 */
  styles?: Record<string, string>;
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
