/**
 * IComponentHeuristic Interface
 *
 * 컴포넌트 유형별 휴리스틱 인터페이스.
 * 각 휴리스틱이 자신의 컴포넌트 유형 판별과 처리를 모두 담당합니다.
 *
 * 각 휴리스틱은:
 * 1. canProcess()로 자신이 처리할 수 있는 컴포넌트인지 판별
 * 2. process()로 전체 파이프라인 실행
 *   - processStructure(): 구조 생성 (variant 병합, props 추출)
 *   - processAnalysis(): 분석 (semantic roles, hidden 처리)
 *   - processTransform(): 노드 변환 (스타일, props 바인딩)
 *   - processBuild(): 최종 조립 (DesignTree 생성)
 */

import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";

/**
 * 컴포넌트별 휴리스틱 인터페이스
 */
export interface IComponentHeuristic {
  /** 이 휴리스틱이 처리하는 컴포넌트 유형 */
  readonly componentType: ComponentType;

  /** 휴리스틱 이름 (디버깅용) */
  readonly name: string;

  /** State → pseudo-class 매핑 */
  readonly stateMapping: Record<string, PseudoClass | null>;

  /**
   * 이 휴리스틱이 해당 컴포넌트를 처리할 수 있는지 판별
   * score() >= MATCH_THRESHOLD 이면 true
   *
   * @param ctx BuildContext
   * @returns 처리 가능 여부
   */
  canProcess(ctx: BuildContext): boolean;

  /**
   * 컴포넌트와의 매칭 점수 계산
   * 높을수록 더 적합한 휴리스틱
   *
   * 점수 기준:
   * - 0: 불일치 (GenericHeuristic fallback)
   * - 10+: 기본 키워드 매칭 (button, input 등)
   * - 15+: 구조 패턴 매칭 (caret, toggle knob 등)
   *
   * @param ctx BuildContext
   * @returns 매칭 점수 (0 이상)
   */
  score(ctx: BuildContext): number;

  /**
   * State → pseudo-class 변환
   *
   * @param state State 문자열 (예: "hover", "pressed")
   * @returns 대응하는 pseudo-class (예: ":hover", ":active") 또는 null/undefined
   */
  stateToPseudo(state: string): PseudoClass | null | undefined;

  // ===========================================================================
  // 파이프라인 메서드 (전체 위임)
  // ===========================================================================

  /**
   * 전체 처리 (메인 엔트리포인트)
   * processStructure → processAnalysis → processTransform → processBuild
   *
   * @param ctx BuildContext
   * @returns 처리된 BuildContext
   */
  process(ctx: BuildContext): BuildContext;

  /**
   * Phase 1: 구조 생성
   * - Variant 병합
   * - Instance 내부 노드 정리
   * - Props 추출
   */
  processStructure(ctx: BuildContext): BuildContext;

  /**
   * Phase 2: 분석
   * - Semantic roles 감지
   * - Hidden 노드 처리
   */
  processAnalysis(ctx: BuildContext): BuildContext;

  /**
   * Phase 3: 노드 변환
   * - Node type 매핑
   * - Style 분류
   * - Props 바인딩
   * - Slot 감지
   */
  processTransform(ctx: BuildContext): BuildContext;

  /**
   * Phase 4: 최종 조립
   * - DesignNode 트리 생성
   * - 정리 (hidden 노드 제거 등)
   */
  processBuild(ctx: BuildContext): BuildContext;

  // ===========================================================================
  // 세부 처리 메서드 (override 가능)
  // ===========================================================================

  // Phase 1: 구조 생성
  /** 구조: Variant 병합 */
  processVariants(ctx: BuildContext): BuildContext;
  /** 구조: Instance 내부 노드 정리 */
  processInstanceCleanup(ctx: BuildContext): BuildContext;
  /** 구조: Props 추출 */
  processPropsExtract(ctx: BuildContext): BuildContext;

  // Phase 3: 노드 변환
  /** 변환: Node type 매핑 */
  processNodeTypes(ctx: BuildContext): BuildContext;
  /** 변환: Style 분류 (base/dynamic/pseudo) */
  processStyles(ctx: BuildContext): BuildContext;
  /** 변환: Position 스타일 */
  processPositions(ctx: BuildContext): BuildContext;
  /** 변환: Rotation 처리 */
  processRotation(ctx: BuildContext): BuildContext;
  /** 변환: External refs 생성 */
  processExternalRefs(ctx: BuildContext): BuildContext;
  /** 변환: Visibility 조건 */
  processVisibility(ctx: BuildContext): BuildContext;
  /** 변환: Props 바인딩 */
  processProps(ctx: BuildContext): BuildContext;
  /** 변환: Slot 감지 */
  processSlots(ctx: BuildContext): BuildContext;

  // Phase 4: 최종 조립
  /** 조립: DesignNode 트리 생성 */
  buildDesignTree(ctx: BuildContext): BuildContext;
  /** 조립: 정리 (hidden 노드 제거 등) */
  processCleanup(ctx: BuildContext): BuildContext;
}
