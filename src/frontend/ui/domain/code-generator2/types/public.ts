/**
 * UI/외부 소비자용 공개 타입 정의
 *
 * FigmaCodeGenerator의 결과를 UI(PropController, App.tsx 등)에서
 * 소비할 때 사용하는 인터페이스들.
 * 내부 파이프라인 타입(types.ts)과 분리되어 있다.
 */

import type { StyleStrategyType } from "../layers/code-emitter/react/ReactEmitter";

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
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT" | "function";
  defaultValue: any;
  variantOptions?: string[];
  slotInfo?: SlotInfo;
  functionSignature?: string;
  /** 추가 문자열 리터럴 값 (예: ["indeterminate"]) — boolean | "indeterminate" 타입 */
  extraValues?: string[];
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
}
