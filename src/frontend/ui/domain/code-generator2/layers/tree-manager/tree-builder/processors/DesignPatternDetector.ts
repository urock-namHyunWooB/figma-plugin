import type { DesignPattern } from "../../../../types/types";

/**
 * DesignPatternDetector
 *
 * Raw Figma SceneNode에서 디자인 패턴을 감지하여 반환.
 * Merger 이전에 한 번만 실행. 노드 mutation 없이 결과만 반환.
 *
 * 감지 패턴:
 * - alphaMask: isMask + ALPHA + visible ref
 * - interactionFrame: name=Interaction + type=FRAME
 * - fullCoverBackground: fills-only child covering parent 99%+
 * - statePseudoClass: componentPropertyDefinitions의 State variant
 * - breakpointVariant: componentPropertyDefinitions의 Breakpoint variant
 *
 * booleanPositionSwap는 merger에서 별도 감지.
 */
export class DesignPatternDetector {
  private static readonly STATE_TO_PSEUDO: Record<string, string> = {
    Hover: ":hover",     Active: ":active",     Pressed: ":active",
    hover: ":hover",     active: ":active",     pressed: ":active",
    Focus: ":focus",     Disabled: ":disabled",  Visited: ":visited",
    focus: ":focus",     disabled: ":disabled",  visited: ":visited",
    disable: ":disabled",
  };

  private static readonly BP_NAME_RE = /breakpoint|device|screen/i;
  private static readonly STATE_KEY_RE = /^states?$/i;

  /**
   * Raw Figma SceneNode에서 디자인 패턴을 감지하여 반환.
   * DataManager는 현재 사용하지 않지만, 향후 확장을 위해 시그니처 유지.
   */
  detect(node: SceneNode): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    const seenIds = new Set<string>();

    if (node.type === "COMPONENT_SET") {
      const variants = (node as any).children ?? [];
      const propDefs = (node as any).componentPropertyDefinitions ?? {};

      // Node-level patterns: traverse each variant's tree
      for (const variant of variants) {
        this.walkRawNode(variant, variant, seenIds, patterns);
      }

      // Component-level patterns: analyze componentPropertyDefinitions
      this.detectLayoutModeSwitch(variants, propDefs, patterns);
      this.detectStatePseudoClass(propDefs, patterns);
      this.detectBreakpointVariant(propDefs, patterns);
    } else {
      // Single COMPONENT
      this.walkRawNode(node as any, null, seenIds, patterns);
    }

    return patterns;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Node-level traversal
  // ─────────────────────────────────────────────────────────────────────────

  private walkRawNode(
    node: any,
    parent: any | null,
    seenIds: Set<string>,
    patterns: DesignPattern[],
  ): void {
    this.detectAlphaMask(node, seenIds, patterns);
    this.detectInteractionFrame(node, seenIds, patterns);
    this.detectFullCoverBackground(node, parent, seenIds, patterns);
    this.detectExposedInstanceSlot(node, seenIds, patterns);

    for (const child of node.children ?? []) {
      this.walkRawNode(child, node, seenIds, patterns);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // alphaMask
  // ─────────────────────────────────────────────────────────────────────────

  private detectAlphaMask(
    node: any,
    seenIds: Set<string>,
    patterns: DesignPattern[],
  ): void {
    if (node.isMask !== true) return;
    if (node.maskType !== "ALPHA") return;

    const visibleRef = node.componentPropertyReferences?.visible;
    if (!visibleRef) return;

    const key = `alphaMask:${node.id}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);

    patterns.push({ type: "alphaMask", nodeId: node.id, visibleRef });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // interactionFrame
  // ─────────────────────────────────────────────────────────────────────────

  private detectInteractionFrame(
    node: any,
    seenIds: Set<string>,
    patterns: DesignPattern[],
  ): void {
    if (node.type !== "FRAME") return;
    if (node.name !== "Interaction") return;

    const key = `interactionFrame:${node.id}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);

    patterns.push({ type: "interactionFrame", nodeId: node.id });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fullCoverBackground
  // ─────────────────────────────────────────────────────────────────────────

  private detectFullCoverBackground(
    node: any,
    parent: any | null,
    seenIds: Set<string>,
    patterns: DesignPattern[],
  ): void {
    if (!parent) return;

    // children이 있으면 스타일 전용이 아님
    if (node.children && node.children.length > 0) return;
    // TEXT, INSTANCE는 콘텐츠 노드
    if (node.type === "TEXT" || node.type === "INSTANCE") return;
    // 부모의 유일한 자식이면 콘텐츠이지 배경이 아님
    const siblings = parent.children ?? [];
    if (siblings.length <= 1) return;

    // fills 외에 strokes/effects가 있으면 단순 배경이 아님
    if (hasVisibleStrokes(node)) return;
    if (hasVisibleEffects(node)) return;
    if (!hasVisibleFills(node)) return;

    // coverage 확인
    if (!isFullyCovering(node, parent)) return;

    // 부모에 이미 fills가 있고 다른 값이면 충돌
    if (hasVisibleFills(parent) && !sameFills(node, parent)) return;

    const key = `fullCoverBackground:${node.id}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);

    patterns.push({ type: "fullCoverBackground", nodeId: node.id });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // exposedInstanceSlot
  // ─────────────────────────────────────────────────────────────────────────

  private detectExposedInstanceSlot(
    node: any,
    seenIds: Set<string>,
    patterns: DesignPattern[],
  ): void {
    const visibleRef = node.componentPropertyReferences?.visible;
    if (!visibleRef) return;

    // dedup by visibleRef (여러 variant에서 같은 패턴 반복)
    const key = `exposedInstanceSlot:${visibleRef}`;
    if (seenIds.has(key)) return;

    // 노드 자체가 exposed INSTANCE인 경우
    if (node.type === "INSTANCE" && node.isExposedInstance === true) {
      seenIds.add(key);
      patterns.push({
        type: "exposedInstanceSlot",
        nodeId: node.id,
        instanceNodeId: node.id,
        visibleRef,
      });
      return;
    }

    // 직계 자식에서 exposed INSTANCE 탐색
    const children: any[] = node.children ?? [];
    const exposedChild = children.find(
      (c) => c.type === "INSTANCE" && c.isExposedInstance === true,
    );
    if (!exposedChild) return;

    seenIds.add(key);
    patterns.push({
      type: "exposedInstanceSlot",
      nodeId: node.id,
      instanceNodeId: exposedChild.id,
      visibleRef,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // layoutModeSwitch (component-level)
  // ─────────────────────────────────────────────────────────────────────────

  private detectLayoutModeSwitch(
    variants: any[],
    propDefs: Record<string, any>,
    patterns: DesignPattern[],
  ): void {
    if (variants.length < 2) return;

    // 1. Parse variant names into prop=value maps
    const variantPropMaps: Array<{ props: Record<string, string>; variant: any }> = [];
    for (const v of variants) {
      const name: string = v.name ?? "";
      const props: Record<string, string> = {};
      for (const segment of name.split(",")) {
        const eqIdx = segment.indexOf("=");
        if (eqIdx < 0) continue;
        const key = segment.slice(0, eqIdx).trim();
        const val = segment.slice(eqIdx + 1).trim();
        props[key] = val;
      }
      if (Object.keys(props).length > 0) {
        variantPropMaps.push({ props, variant: v });
      }
    }
    if (variantPropMaps.length < 2) return;

    // 2. Collect variant prop keys (only VARIANT type) with their known values
    const variantPropKeys: string[] = [];
    const variantPropValues = new Map<string, string[]>();
    for (const [rawKey, def] of Object.entries(propDefs)) {
      if (def.type !== "VARIANT") continue;
      const cleanKey = rawKey.split("#")[0].trim();
      variantPropKeys.push(cleanKey);
      if (def.variantOptions?.length) {
        variantPropValues.set(cleanKey, def.variantOptions);
      }
    }

    // 3. For each container name, collect children names per variant
    // containerName → variantIndex → sorted children names
    const containerChildrenMap = new Map<string, Map<number, string[]>>();

    for (let vi = 0; vi < variantPropMaps.length; vi++) {
      const { variant } = variantPropMaps[vi];
      this.collectContainerChildren(variant.children ?? [], vi, containerChildrenMap);
    }

    // 4. For each candidate prop, check if it alone determines children structure change
    for (const propKey of variantPropKeys) {
      for (const [containerName, variantChildrenMap] of containerChildrenMap) {
        // Group variants by this prop's value, collecting children name sets
        const valueToChildrenSets = new Map<string, Set<string>>();
        let consistent = true;

        for (let vi = 0; vi < variantPropMaps.length; vi++) {
          const { props } = variantPropMaps[vi];
          const propVal = props[propKey];
          if (propVal === undefined) continue;

          const childNames = variantChildrenMap.get(vi);
          if (!childNames) continue;

          const childKey = childNames.join(",");
          if (!valueToChildrenSets.has(propVal)) {
            valueToChildrenSets.set(propVal, new Set([childKey]));
          } else {
            valueToChildrenSets.get(propVal)!.add(childKey);
          }
        }

        // Each prop value must map to exactly one children structure
        for (const childKeysForVal of valueToChildrenSets.values()) {
          if (childKeysForVal.size > 1) {
            consistent = false;
            break;
          }
        }
        if (!consistent) continue;

        // Must have at least 2 different children structures
        const uniqueStructures = new Set<string>();
        for (const childKeysForVal of valueToChildrenSets.values()) {
          for (const k of childKeysForVal) uniqueStructures.add(k);
        }
        if (uniqueStructures.size < 2) continue;

        // All prop values must be represented in the branches
        // (skip if some values have no container / no children — incomplete branches)
        const allValues = variantPropValues.get(propKey);
        if (allValues && allValues.some((v) => !valueToChildrenSets.has(v))) continue;

        // Build raw branches: prop value → children names
        const rawBranches: Record<string, string[]> = {};
        for (const [val, childKeysForVal] of valueToChildrenSets) {
          const childKey = [...childKeysForVal][0];
          rawBranches[val] = childKey.split(",");
        }

        // Remove common children (intersection) — these are always-visible, not part of the switch.
        // Only the differing children should be in the branches.
        const branchSets = Object.values(rawBranches).map((names) => new Set(names));
        const commonChildren = new Set(
          [...branchSets[0]].filter((name) => branchSets.every((s) => s.has(name)))
        );

        const branches: Record<string, string[]> = {};
        for (const [val, names] of Object.entries(rawBranches)) {
          branches[val] = names.filter((n) => !commonChildren.has(n));
        }

        // After removing common children, must still have at least 2 distinct non-empty structures
        const distinctBranchKeys = new Set(
          Object.values(branches).map((names) => names.join(","))
        );
        if (distinctBranchKeys.size < 2) continue;

        // Skip if any branch has no unique children (implies subset relationship)
        if (Object.values(branches).some((names) => names.length === 0)) continue;

        // Find a representative container nodeId
        const firstVariantChildren = variantChildrenMap.values().next().value;
        const containerNodeId = this.findContainerNodeId(
          variantPropMaps[0].variant.children ?? [],
          containerName,
        ) ?? containerName;

        const prop = normalizePropName(propKey);
        patterns.push({
          type: "layoutModeSwitch",
          containerNodeId,
          prop,
          branches,
        });
      }
    }
  }

  /** Recursively collect container → children names mapping for a variant */
  private collectContainerChildren(
    nodes: any[],
    variantIndex: number,
    map: Map<string, Map<number, string[]>>,
  ): void {
    for (const node of nodes) {
      const children = node.children ?? [];
      if (children.length > 0) {
        const containerName: string = node.name ?? "";
        if (!map.has(containerName)) map.set(containerName, new Map());
        const childNames = children.map((c: any) => c.name ?? "").sort();
        map.get(containerName)!.set(variantIndex, childNames);
        this.collectContainerChildren(children, variantIndex, map);
      }
    }
  }

  /** Find nodeId for a container by name in raw children */
  private findContainerNodeId(nodes: any[], name: string): string | undefined {
    for (const node of nodes) {
      if (node.name === name && node.id) return node.id;
      const found = this.findContainerNodeId(node.children ?? [], name);
      if (found) return found;
    }
    return undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // statePseudoClass (component-level)
  // ─────────────────────────────────────────────────────────────────────────

  private detectStatePseudoClass(
    propDefs: Record<string, any>,
    patterns: DesignPattern[],
  ): void {
    for (const [rawKey, def] of Object.entries(propDefs)) {
      if (def.type !== "VARIANT") continue;

      const cleanKey = rawKey.split("#")[0].trim();
      if (!DesignPatternDetector.STATE_KEY_RE.test(cleanKey)) continue;

      const options: string[] = def.variantOptions ?? [];
      if (options.length === 0) continue;

      const stateMap: Record<string, string> = {};
      for (const opt of options) {
        const pseudo = DesignPatternDetector.STATE_TO_PSEUDO[opt];
        if (pseudo) stateMap[opt] = pseudo;
      }
      if (Object.keys(stateMap).length === 0) return;

      const prop = normalizePropName(rawKey);
      patterns.push({ type: "statePseudoClass", prop, stateMap });
      return; // only one State prop
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // breakpointVariant (component-level)
  // ─────────────────────────────────────────────────────────────────────────

  private detectBreakpointVariant(
    propDefs: Record<string, any>,
    patterns: DesignPattern[],
  ): void {
    for (const [rawKey, def] of Object.entries(propDefs)) {
      if (def.type !== "VARIANT") continue;

      const cleanKey = rawKey.split("#")[0].trim();
      if (!DesignPatternDetector.BP_NAME_RE.test(cleanKey)) continue;

      const prop = normalizePropName(rawKey);
      patterns.push({ type: "breakpointVariant", prop });
      return; // only one breakpoint prop
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prop name normalization (mirrors PropsExtractor.normalizePropName)
// ─────────────────────────────────────────────────────────────────────────────

const JS_RESERVED_WORDS = new Set([
  "break", "case", "catch", "continue", "debugger", "default", "delete",
  "do", "else", "finally", "for", "function", "if", "in", "instanceof",
  "new", "return", "switch", "this", "throw", "try", "typeof", "var",
  "void", "while", "with", "class", "const", "enum", "export", "extends",
  "import", "super", "implements", "interface", "let", "package", "private",
  "protected", "public", "static", "yield", "await", "async",
]);

function normalizePropName(sourceKey: string): string {
  // eslint-disable-next-line no-control-regex
  const sanitized = sourceKey.replace(/[\x00-\x1F\x7F]/g, "");
  const cleanKey = sanitized.split("#")[0].trim();
  const asciiClean = cleanKey.replace(/[^a-zA-Z0-9\s]/g, " ").trim();

  let propName = asciiClean
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toLowerCase() + word.slice(1);
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");

  if (!propName) propName = "prop";
  if (/^[0-9]/.test(propName)) propName = "_" + propName;

  // JavaScript 예약어 충돌 방지 (mirrors PropsExtractor.normalizePropName)
  if (JS_RESERVED_WORDS.has(propName.toLowerCase())) {
    propName = "is" + propName.charAt(0).toUpperCase() + propName.slice(1);
  }

  return propName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw node helpers (same logic as RedundantNodeCollapser)
// ─────────────────────────────────────────────────────────────────────────────

function hasVisibleFills(node: any): boolean {
  return (
    Array.isArray(node?.fills) &&
    node.fills.some((f: any) => f.type && f.visible !== false)
  );
}

function hasVisibleStrokes(node: any): boolean {
  return (
    Array.isArray(node?.strokes) &&
    node.strokes.some((s: any) => s.type && s.visible !== false)
  );
}

function hasVisibleEffects(node: any): boolean {
  return (
    Array.isArray(node?.effects) &&
    node.effects.some((e: any) => e.visible !== false)
  );
}

function isFullyCovering(child: any, parent: any): boolean {
  const cBox = child.absoluteBoundingBox;
  const pBox = parent.absoluteBoundingBox;
  if (!cBox || !pBox || pBox.width === 0 || pBox.height === 0) return false;

  const covW = cBox.width / pBox.width;
  const covH = cBox.height / pBox.height;
  return covW >= 0.99 && covH >= 0.99;
}

function sameFills(a: any, b: any): boolean {
  return JSON.stringify(a.fills) === JSON.stringify(b.fills);
}
