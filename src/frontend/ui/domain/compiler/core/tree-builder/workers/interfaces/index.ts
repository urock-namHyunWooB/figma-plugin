/**
 * TreeBuilder Worker Interfaces
 *
 * 각 Worker의 인터페이스 정의
 * TreeBuilder는 이 인터페이스들을 통해 구현에 의존하지 않고 추상화에 의존합니다.
 *
 * 파일 구조:
 * - core.ts: 공유 타입 (InternalNode, MergedNodeWithVariant, Figma 타입)
 * - variant.ts: IVariantMerger, ISquashByIou
 * - node.ts: INodeTypeMapper, ISemanticRoleDetector
 * - style.ts: IStyleClassifier, IPositionStyler
 * - props.ts: IPropsExtractor, IPropsLinker
 * - slot.ts: ISlotDetector, ITextSlotDetector
 * - visibility.ts: IVisibilityDetector, IVisibilityResolver, IConditionParser, IHiddenNodeProcessor
 * - instance.ts: IInstanceOverrideHandler, IExternalRefBuilder
 */

// BuildContext (별도 파일)
export type { BuildContext, SemanticRoleEntry, ExternalRefData } from "../BuildContext";

// Core Types
export type {
  FigmaFill,
  FigmaStroke,
  FigmaEffect,
  ComponentPropertyValue,
  MergedNodeWithVariant,
  InternalNode,
} from "./core";

// Variant
export type { IVariantMerger, ISquashByIou } from "./variant";

// Node
export type {
  INodeTypeMapper,
  SemanticNode,
  SemanticRoleResult,
  ISemanticRoleDetector,
} from "./node";

// Style
export type {
  VariantStyle,
  IStyleClassifier,
  PositionResult,
  PositionableNode,
  IPositionStyler,
} from "./style";

// Props
export type { PropBinding, IPropsLinker, IPropsExtractor } from "./props";

// Slot
export type {
  SlotCandidate,
  ISlotDetector,
  TextSlotInput,
  TextSlotResult,
  ITextSlotDetector,
} from "./slot";

// Visibility
export type {
  IVisibilityDetector,
  HiddenProcessableNode,
  HiddenNodeResult,
  IHiddenNodeProcessor,
  VisibilityInput,
  VisibilityResult,
  IVisibilityResolver,
  IConditionParser,
} from "./visibility";

// Instance
export type {
  OverrideInfo,
  IInstanceOverrideHandler,
  ExternalRefInput,
  ExternalRefResult,
  IExternalRefBuilder,
} from "./instance";
