// Component Structure 관련 타입 정의

/**
 * Figma 요소 정보
 */
export interface StructureElement {
  id: string;
  name: string;
  type: string; // "FRAME" | "TEXT" | "INSTANCE" | "RECTANGLE" 등
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  /** padding 값: auto layout 프레임/컴포넌트 등에서 사용 */
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** margin 유사 개념: 부모 auto layout의 itemSpacing을 자식에 분배하여 표현 */
  margin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** auto layout 및 정렬/간격 정보 */
  layout?: {
    layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
    itemSpacing: number;
    primaryAxisAlignItems?: string; // 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
    counterAxisAlignItems?: string; // 'MIN' | 'CENTER' | 'MAX'
    layoutGrow?: number; // child 전용
    layoutAlign?: string; // child 전용: 'STRETCH' | 'INHERIT' 등
  };
  children?: StructureElement[];
}

/**
 * Component Set의 전체 구조
 */
export interface ComponentStructureData {
  baseVariantId: string;
  baseVariantName: string;
  elements: StructureElement[];
  boundingBox: {
    width: number;
    height: number;
  };
  /** Base variant의 padding */
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Base variant의 auto layout 정보 */
  layout?: {
    layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
    itemSpacing: number;
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
  };
}

/**
 * 요소의 prop 매핑 (단순화)
 */
export interface ElementBinding {
  elementId: string;
  elementName: string;
  elementType: string;
  connectedPropName: string | null; // 연결된 prop 이름 (하나만)
}

/**
 * 전체 바인딩 맵
 */
export interface ElementBindingsMap {
  [elementId: string]: ElementBinding;
}

/**
 * Expression 검증 결과
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  referencedProps?: string[];
  referencedStates?: string[];
}

/**
 * Props/State 정의 (SetProps, SetInternalState에서 가져온 데이터)
 */
export interface PropDefinition {
  id: string;
  name: string;
  type: string;
  defaultValue?: any;
  required?: boolean;
  description?: string;
}

export interface StateDefinition {
  id: string;
  name: string;
  type: string;
  initialValue: any;
  description?: string;
}

