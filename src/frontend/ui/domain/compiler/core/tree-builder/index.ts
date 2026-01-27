/**
 * TreeBuilder Module
 *
 * PreparedDesignData → DesignTree 변환
 *
 * @see types/architecture.ts - ITreeBuilder 인터페이스
 */

export { default as TreeBuilder, type SemanticRoleEntry } from "./TreeBuilder";

// Processors
export { NodeProcessor } from "./workers/NodeProcessor";
export { PropsProcessor } from "./workers/PropsProcessor";
export { StyleProcessor, type StyleBuildInput, type PositionableNode } from "./workers/StyleProcessor";
export { VisibilityProcessor, type VisibleState } from "./workers/VisibilityProcessor";
export { SlotProcessor } from "./workers/SlotProcessor";
export {
  VariantProcessor,
  calculateIoU,
  getRelativeBounds,
  calculateIouFromRoot,
  type InternalNode,
  type MergedNodeInfo,
} from "./workers/VariantProcessor";
export { InstanceProcessor } from "./workers/InstanceProcessor";

// Types from interfaces
export type {
  IConditionParser,
  SemanticNode,
  SemanticRoleResult,
  PropBinding,
  VariantStyle,
  PositionResult,
  MergedNodeWithVariant,
  VisibilityInput,
  VisibilityResult,
  HiddenProcessableNode,
  SlotCandidate,
  TextSlotInput,
  TextSlotResult,
  ExternalRefInput,
  ExternalRefResult,
  HiddenNodeResult,
  OverrideInfo,
} from "./workers/interfaces";

// Utils
export {
  toCamelCase,
  toPascalCase,
  toKebabCase,
} from "./workers/utils/stringUtils";

export {
  hasChildren,
  isInstanceNode,
  getComponentId,
} from "./workers/utils/typeGuards";
