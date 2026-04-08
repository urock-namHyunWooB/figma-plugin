/**
 * SemanticIRBuilder
 *
 * Layer 2.5: UITree -> SemanticComponent.
 * See: docs/superpowers/specs/2026-04-08-code-emitter-semantic-ir-design.md
 */

import type { UITree, UINode, BindingSource, StateVar } from "../../types/types";
import type {
  SemanticComponent,
  SemanticNode,
  StateDefinition,
} from "./SemanticIR";
import { toComponentName } from "../../utils/nameUtils";

/** Explicit set of binding keys treated as event handlers (rest go to attrs). */
export const EVENT_KEYS: ReadonlySet<string> = new Set([
  "onClick", "onChange", "onInput", "onFocus", "onBlur",
  "onKeyDown", "onKeyUp", "onSubmit", "onMouseEnter", "onMouseLeave",
]);

export class SemanticIRBuilder {
  static build(uiTree: UITree): SemanticComponent {
    return {
      name: toComponentName(uiTree.root.name),
      props: uiTree.props,
      state: this.normalizeState(uiTree.stateVars),
      // FIXME(future): expression is a JS string — needs ExpressionNode IR
      //                when adding non-JS targets (SwiftUI/Compose).
      //                See spec §10.1 Known Future Debt.
      derived: uiTree.derivedVars ?? [],
      arraySlots: uiTree.arraySlots,
      structure: this.buildNode(uiTree.root),
      componentType: uiTree.componentType,
      isDependency: uiTree.isDependency,
    };
  }

  private static buildNode(n: UINode): SemanticNode {
    const { attrs, events } = this.splitAttrsAndEvents(n.bindings?.attrs);
    const node: SemanticNode = {
      id: n.id,
      kind: n.type as SemanticNode["kind"],
      name: n.name,
      attrs,
      events,
      styles: n.styles,
      content: n.bindings?.content,
      visibleCondition: n.visibleCondition,
      semanticType: n.semanticType,
    };

    if (n.bindings?.style) node.styleBindings = n.bindings.style;

    const anyN = n as any;

    // textContent: CSS-preserving text binding (non-standard Bindings field)
    const anyBindings = n.bindings as any;
    if (anyBindings?.textContent) node.textContent = anyBindings.textContent;

    // textSegments: rich text
    if (anyN.textSegments !== undefined) node.textSegments = anyN.textSegments;

    if ("children" in n && Array.isArray(anyN.children)) {
      node.children = anyN.children.map((c: UINode) => this.buildNode(c));
    }

    if (anyN.vectorSvg !== undefined) node.vectorSvg = anyN.vectorSvg;
    if (anyN.variantSvgs !== undefined) node.variantSvgs = anyN.variantSvgs;
    if (anyN.refId !== undefined) node.refId = anyN.refId;
    if (anyN.overrideProps !== undefined) node.overrideProps = anyN.overrideProps;
    if (anyN.overrideMeta !== undefined) node.overrideMeta = anyN.overrideMeta;
    if (anyN.instanceScale !== undefined) node.instanceScale = anyN.instanceScale;
    if (anyN.loop !== undefined) node.loop = anyN.loop;
    if (anyN.childrenSlot !== undefined) node.childrenSlot = anyN.childrenSlot;

    return node;
  }

  private static splitAttrsAndEvents(
    bindings?: Record<string, BindingSource>
  ): { attrs?: Record<string, BindingSource>; events?: Record<string, BindingSource> } {
    if (!bindings) return {};
    const attrs: Record<string, BindingSource> = {};
    const events: Record<string, BindingSource> = {};
    for (const [k, v] of Object.entries(bindings)) {
      if (EVENT_KEYS.has(k)) events[k] = v;
      else attrs[k] = v;
    }
    return {
      attrs: Object.keys(attrs).length ? attrs : undefined,
      events: Object.keys(events).length ? events : undefined,
    };
  }

  private static normalizeState(stateVars?: StateVar[]): StateDefinition[] {
    return (stateVars ?? []).map((sv) => ({
      name: sv.name,
      initialValue: sv.initialValue,
      mutability: "mutable",
    }));
  }
}
