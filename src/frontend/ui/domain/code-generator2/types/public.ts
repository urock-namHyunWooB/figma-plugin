/**
 * UI/외부 소비자용 공개 타입 정의
 *
 * FigmaCodeGenerator의 결과를 UI(PropController, App.tsx 등)에서
 * 소비할 때 사용하는 인터페이스들.
 * 내부 파이프라인 타입(types.ts)과 분리되어 있다.
 */

import type { StyleStrategyType } from "../layers/code-emitter/react/ReactEmitter";
import type { DeclarationStyle, ExportStyle } from "../layers/code-emitter/react/generators/JsxGenerator";

export type { DeclarationStyle, ExportStyle };

// ─── Prop / Slot ────────────────────────────────────────────

export interface SlotInfo {
  componentSetId?: string;
  componentName?: string;
  hasDependency: boolean;
  mockupSvg?: string;
  width?: number;
  height?: number;
}

export interface PropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT" | "function" | "array";
  defaultValue: any;
  variantOptions?: string[];
  slotInfo?: SlotInfo;
  functionSignature?: string;
  /** 추가 문자열 리터럴 값 (예: ["indeterminate"]) — boolean | "indeterminate" 타입 */
  extraValues?: string[];
  /** Array slot 메타 (SLOT이면서 배열인 경우) */
  arraySlotInfo?: {
    itemProps: Array<{ name: string; type: string; defaultValue?: string }>;
  };
}

// ─── 컴파일 결과 ────────────────────────────────────────────

export interface CompiledDependency {
  id: string;
  name: string;
  code: string;
}

export interface MultiComponentResult {
  mainCode: string;
  mainName: string;
  dependencies: CompiledDependency[];
}

// ─── 옵션 ───────────────────────────────────────────────────

export type StyleNamingStrategy = "verbose" | "compact" | "minimal";

export interface NamingOptions {
  /** 컴포넌트명 직접 지정 (설정 시 prefix/suffix 무시) */
  componentName?: string;
  componentPrefix?: string;
  componentSuffix?: string;
  conflictPropPrefix?: string;
  styleBaseSuffix?: string;
  styleVariantSuffix?: string;
  styleNamingStrategy?: StyleNamingStrategy;
}

export interface TailwindOptions {
  /** cn 함수를 인라인으로 생성할지 (기본: true) */
  inlineCn?: boolean;
  /** cn import 경로 (inlineCn: false일 때 사용, 기본: "@/lib/cn") */
  cnImportPath?: string;
}

export interface GeneratorOptions {
  /** 스타일 전략: emotion (기본) 또는 tailwind */
  styleStrategy?:
    | StyleStrategyType
    | { type: StyleStrategyType; tailwind?: TailwindOptions };
  /** 디버그 모드: data-figma-id 속성 추가 */
  debug?: boolean;
  /** 컴포넌트 선언 스타일 */
  declarationStyle?: DeclarationStyle;
  /** export 방식 */
  exportStyle?: ExportStyle;
  /** 네이밍 커스터마이징 */
  naming?: NamingOptions;
}
