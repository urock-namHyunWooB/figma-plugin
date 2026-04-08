/**
 * SemanticIR
 *
 * Framework-agnostic intermediate representation between UITree (Figma semantics)
 * and the emitter layer (target framework). Each emitter (React, Vue, SwiftUI...)
 * consumes the same SemanticComponent.
 *
 * See: docs/superpowers/specs/2026-04-08-code-emitter-semantic-ir-design.md
 */

import type {
  PropDefinition,
  ArraySlotInfo,
  StyleObject,
  BindingSource,
  ConditionNode,
  TextSegment,
  InstanceOverride,
  ComponentType,
} from "../../types/types";

/** Node kind — same value space as UINodeType, distinct name to mark IR boundary */
export type SemanticNodeKind =
  | "container"
  | "text"
  | "image"
  | "vector"
  | "button"
  | "input"
  | "link"
  | "slot"
  | "component";

/**
 * State definition (framework-agnostic).
 *
 * `setter` field removed: each emitter generates its own
 * (React: useState; Vue: ref; Svelte: $state; SwiftUI: @State).
 */
export interface StateDefinition {
  name: string;
  initialValue: string;
  /** "mutable" — Phase 1 always mutable; "computed" reserved for future Heuristic upgrades */
  mutability: "mutable" | "computed";
}

/**
 * Derived (computed) variable.
 *
 * FIXME(future): expression is a JS string — needs ExpressionNode IR
 * when adding non-JS targets (SwiftUI/Compose).
 * See spec §10.1 Known Future Debt.
 */
export interface DerivedDefinition {
  name: string;
  expression: string;
}

/**
 * Single semantic node (one element in the component tree).
 *
 * `attrs` and `events` are split (UITree's bindings.attrs mixed both).
 * `styles` carries CSS as-is — platform-specific style adapters live in each emitter.
 */
export interface SemanticNode {
  id: string;
  kind: SemanticNodeKind;
  name: string;

  attrs?: Record<string, BindingSource>;
  events?: Record<string, BindingSource>;
  styles?: StyleObject;
  styleBindings?: Record<string, BindingSource>;
  content?: BindingSource | TextSegment[];
  visibleCondition?: ConditionNode;
  children?: SemanticNode[];

  // kind-specific fields (passed through from UINode)
  vectorSvg?: string;
  variantSvgs?: Record<string, string>;
  refId?: string;
  overrideProps?: Record<string, string>;
  overrideMeta?: InstanceOverride[];
  instanceScale?: number;
  loop?: { dataProp: string; keyField?: string };
  childrenSlot?: string;
  semanticType?: string;
}

/**
 * Top-level component IR. Output of SemanticIRBuilder, input of every emitter.
 */
export interface SemanticComponent {
  name: string;
  props: PropDefinition[];
  state: StateDefinition[];
  derived: DerivedDefinition[];
  arraySlots?: ArraySlotInfo[];
  structure: SemanticNode;
  componentType?: ComponentType;
  isDependency?: boolean;
}
