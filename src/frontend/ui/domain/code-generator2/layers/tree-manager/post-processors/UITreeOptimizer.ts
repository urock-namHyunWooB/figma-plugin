/**
 * UITreeOptimizer
 *
 * UITree 후처리 최적화:
 * 1. mergeRedundantDynamicStyles — 모든 variant에서 동일한 dynamic style을 base에 병합
 * 2. decomposeDynamicStyles — AND 조건 폭발을 FD 분해하여 단일 prop 조건으로 축소
 * 3. pruneUnusedProps — 트리에서 참조되지 않는 variant/boolean props 제거
 * 4. makeRootFlexible — dependency 루트의 고정 크기를 100%로 변환
 *
 * CodeEmitter가 아닌 TreeManager 단계에서 실행되어,
 * 어떤 emitter(React/Vue/Svelte)를 사용하든 동일한 최적화가 적용된다.
 */

import type { UITree, UINode, ConditionNode, PseudoClass, VariantInconsistency } from "../../../types/types";
import { extractAllPropNames } from "../../../types/conditionUtils";
import { DynamicStyleDecomposer, type DecomposedResult } from "./DynamicStyleDecomposer";
import { DynamicStyleOptimizer } from "./DynamicStyleOptimizer";

export class UITreeOptimizer {
  /**
   * 메인 트리 최적화 (dynamic styles 병합 → FD 분해)
   */
  optimizeMain(tree: UITree, diagnostics?: VariantInconsistency[]): void {
    this.removeVariantOnlySlots(tree);
    this.transformLayoutModeSwitches(tree.root);
    this.hoistSharedChildConditions(tree.root);
    this.mergeRedundantDynamicStyles(tree.root);
    this.decomposeDynamicStyles(tree.root, diagnostics);
  }

  /**
   * 의존 트리 최적화 (dynamic styles 병합 + 루트 유연화 → FD 분해)
   */
  optimizeDependency(tree: UITree, diagnostics?: VariantInconsistency[]): void {
    this.transformLayoutModeSwitches(tree.root);
    this.hoistSharedChildConditions(tree.root);
    this.mergeRedundantDynamicStyles(tree.root);
    this.makeRootFlexible(tree);
    this.decomposeDynamicStyles(tree.root, diagnostics);
  }

  // ─── transformLayoutModeSwitches ─────────────────────────

  /**
   * layoutModeSwitch annotation이 있는 컨테이너의 조건부 자식들을
   * conditionalGroup 노드로 교체한다.
   */
  private transformLayoutModeSwitches(node: UINode): void {
    if (!("children" in node) || !node.children) return;

    // Recurse children first (bottom-up)
    for (const child of node.children) {
      this.transformLayoutModeSwitches(child);
    }

    // Check for layoutModeSwitch annotation
    const lms = (node as any).metadata?.designPatterns?.find(
      (p: any) => p.type === "layoutModeSwitch"
    );
    if (!lms) return;

    const { prop, branches } = lms as { prop: string; branches: Record<string, string[]> };

    // Collect all child names that belong to any branch
    const allBranchChildNames = new Set<string>();
    for (const names of Object.values(branches)) {
      for (const name of names) allBranchChildNames.add(name);
    }

    // Separate: branched children vs common children
    const branchedChildren: UINode[] = [];
    for (const child of node.children) {
      if (allBranchChildNames.has(child.name)) {
        branchedChildren.push(child);
      }
    }

    if (branchedChildren.length === 0) return;

    // Group children into branches
    const groupedBranches: Record<string, UINode[]> = {};
    for (const [value, names] of Object.entries(branches)) {
      groupedBranches[value] = [];
      for (const name of names) {
        const child = branchedChildren.find((c) => c.name === name);
        if (child) {
          // Remove visibleCondition — the conditionalGroup handles branching
          delete child.visibleCondition;
          groupedBranches[value].push(child);
        }
      }
    }

    // Create conditionalGroup node
    const conditionalGroup: any = {
      type: "conditionalGroup",
      id: `${node.id}_cg`,
      name: `${prop}_switch`,
      prop,
      branches: groupedBranches,
    };

    // Replace children: keep common children, insert conditionalGroup where first branched child was
    const newChildren: UINode[] = [];
    let cgInserted = false;

    for (const child of node.children) {
      if (allBranchChildNames.has(child.name)) {
        if (!cgInserted) {
          newChildren.push(conditionalGroup);
          cgInserted = true;
        }
        // Skip — moved into conditionalGroup
      } else {
        newChildren.push(child);
      }
    }

    node.children = newChildren;
  }

  /**
   * 자식 공통 조건 끌어올리기
   *
   * 모든 자식이 동일한 visibleCondition을 공유하면:
   * 1. 그 조건을 부모의 visibleCondition에 AND로 합성
   * 2. 자식들에서 visibleCondition 제거
   *
   * bottom-up 순회하여 가장 깊은 레벨부터 처리.
   * 빈 wrapper div 렌더링을 방지한다.
   */
  hoistSharedChildConditions(node: UINode): void {
    if (!("children" in node) || !node.children) return;

    const hoisted = new Set<UINode>();
    // 루트 노드는 hoisting 대상이 아니므로 자식들만 재귀 처리
    for (const child of node.children) {
      this._hoistSharedChildConditionsRecursive(child, hoisted);
    }
  }

  private _hoistSharedChildConditionsRecursive(node: UINode, hoisted: Set<UINode>): void {
    if (!("children" in node) || !node.children || node.children.length === 0) {
      return;
    }

    // bottom-up: 자식부터 처리
    for (const child of node.children) {
      this._hoistSharedChildConditionsRecursive(child, hoisted);
    }

    // 이미 hoisting으로 조건을 받은 자식은 재-hoisting 대상에서 제외
    // 모든 자식이 visibleCondition을 가지는지 확인 (hoisted된 조건은 원래 조건이 아니므로 제외)
    const allHaveOriginalCondition = node.children.every(
      (child) => child.visibleCondition != null && !hoisted.has(child)
    );
    if (!allHaveOriginalCondition) return;

    // 모든 자식의 조건이 동일한지 확인 (JSON.stringify 비교)
    const firstCondStr = JSON.stringify(node.children[0].visibleCondition);
    const allSame = node.children.every(
      (child) => JSON.stringify(child.visibleCondition) === firstCondStr
    );
    if (!allSame) return;

    // 공통 조건을 부모에 합성
    const sharedCondition = node.children[0].visibleCondition!;
    if (node.visibleCondition) {
      node.visibleCondition = {
        type: "and",
        conditions: [node.visibleCondition, sharedCondition],
      };
    } else {
      node.visibleCondition = sharedCondition;
    }

    // 자식에서 조건 제거
    for (const child of node.children) {
      delete child.visibleCondition;
    }

    // 이 노드가 hoisting으로 조건을 받았음을 기록
    hoisted.add(node);
  }

  /**
   * 미사용 props 제거 (별도 호출 — 현재 비활성)
   * 활성화 시 variant/boolean props 중 트리에서 참조되지 않는 것을 제거.
   */
  pruneUnusedProps(tree: UITree): void {
    this._pruneUnusedProps(tree);
  }

  // ─── removeVariantOnlySlots ───────────────────────────────

  /**
   * variant prop만으로 visibility가 결정되는 slot props를 내부 렌더링으로 전환
   *
   * 예: Tagreview에서 state별로 다른 아이콘 INSTANCE가 slot으로 노출되는 경우
   * → slot binding 제거, slot prop 제거 → 내부 조건부 렌더링으로 유지
   */
  /**
   * 같은 variant prop 값에 배타적으로 매핑된 slot 그룹 제거
   *
   * 예: state="Rejected" → forbid, state="Approved" → success ...
   * 3개 이상의 slot이 같은 variant prop의 다른 값에 1:1 매핑되면
   * 외부 주입이 아닌 내부 렌더링으로 판단
   */
  private removeVariantOnlySlots(tree: UITree): void {
    const variantPropNames = new Set(
      tree.props.filter((p) => p.type === "variant").map((p) => p.name)
    );
    if (variantPropNames.size === 0) return;

    // slot binding 노드들의 variant 조건 수집
    // key: variant prop name, value: slot prop names
    const variantSlotGroups = new Map<string, Set<string>>();
    const slotNodes: Array<{ node: UINode; slotPropName: string }> = [];

    const walk = (node: UINode): void => {
      if (
        node.bindings?.content &&
        "prop" in node.bindings.content &&
        node.visibleCondition
      ) {
        const slotPropName = node.bindings.content.prop;
        const isSlotProp = tree.props.some(
          (p) => p.name === slotPropName && p.type === "slot"
        );

        if (isSlotProp) {
          // eq 조건에서 variant prop 추출
          const variantProp = this.extractSingleVariantEq(
            node.visibleCondition,
            variantPropNames
          );
          if (variantProp) {
            if (!variantSlotGroups.has(variantProp)) {
              variantSlotGroups.set(variantProp, new Set());
            }
            variantSlotGroups.get(variantProp)!.add(slotPropName);
            slotNodes.push({ node, slotPropName });
          }
        }
      }

      if ("children" in node && node.children) {
        for (const child of node.children) walk(child);
      }
    };
    walk(tree.root);

    // 3개 이상 배타적 slot이 있는 그룹만 제거
    const slotsToRemove = new Set<string>();
    for (const [, slots] of variantSlotGroups) {
      if (slots.size >= 3) {
        for (const s of slots) slotsToRemove.add(s);
      }
    }

    if (slotsToRemove.size === 0) return;

    // 제거 대상 slot을 참조하는 모든 binding 제거 (자식 포함)
    const removeBindings = (node: UINode): void => {
      if (
        node.bindings?.content &&
        "prop" in node.bindings.content &&
        slotsToRemove.has(node.bindings.content.prop)
      ) {
        delete node.bindings.content;
      }
      if ("children" in node && node.children) {
        for (const child of node.children) removeBindings(child);
      }
    };
    removeBindings(tree.root);

    // prop 제거
    tree.props = tree.props.filter((p) => !slotsToRemove.has(p.name));
  }

  /**
   * visibleCondition에서 단일 variant prop의 eq 조건을 추출
   * 복합 조건(AND)이어도 variant eq가 포함되면 해당 prop 반환
   */
  private extractSingleVariantEq(
    condition: ConditionNode,
    variantProps: Set<string>
  ): string | null {
    if (condition.type === "eq" && variantProps.has(condition.prop)) {
      return condition.prop;
    }
    if (condition.type === "and") {
      for (const sub of condition.conditions) {
        const result = this.extractSingleVariantEq(sub, variantProps);
        if (result) return result;
      }
    }
    return null;
  }

  // ─── makeRootFlexible ─────────────────────────────────────

  /**
   * dependency 루트의 고정 크기를 100%로 변환.
   * INSTANCE가 parent의 크기를 채우도록 함 (8px 붕괴 방지)
   */
  private makeRootFlexible(tree: UITree): void {
    const root = tree.root;
    if (!root.styles) return;

    const base = root.styles.base;
    const originalWidth = base.width;
    const originalHeight = base.height;

    // 루트와 동일한 크기의 직접 자식이 있는지 확인
    let hasScalableChild = false;
    if ("children" in root && root.children && originalWidth && originalHeight) {
      const parentW = parseFloat(originalWidth as string);
      const parentH = parseFloat(originalHeight as string);

      for (const child of root.children) {
        if (!child.styles?.base) continue;
        const childBase = child.styles.base;
        if (childBase.width === originalWidth && childBase.height === originalHeight) {
          hasScalableChild = true;
          childBase.width = "100%";
          childBase.height = "100%";

          if ("children" in child && child.children && !isNaN(parentW) && !isNaN(parentH)) {
            for (const grandchild of child.children) {
              this.convertPxToPercent(grandchild, parentW, parentH);
            }
          }
        }
      }
    }

    // scalable child가 있으면 root도 100%로 확장
    // 없으면 root 고정 크기 유지 (내부 SVG 좌표계 보존, wrapper가 센터링)
    if (hasScalableChild) {
      if (base.width && typeof base.width === "string" && base.width.endsWith("px")) {
        base.width = "100%";
      }
      if (base.height && typeof base.height === "string" && base.height.endsWith("px")) {
        base.height = "100%";
      }
    }

    if (base.background) {
      base.background = "transparent";
    }
    delete base["border-radius"];
    delete base.border;
    delete base.opacity;
    delete base.padding;
    delete base["padding-top"];
    delete base["padding-right"];
    delete base["padding-bottom"];
    delete base["padding-left"];

    if (root.styles.variants) {
      for (const [, variantStyles] of Object.entries(root.styles.variants)) {
        for (const [, styleObj] of Object.entries(variantStyles as Record<string, any>)) {
          if (styleObj && typeof styleObj === "object") {
            if (styleObj.background) {
              styleObj.background = "transparent";
            }
            delete styleObj["border-radius"];
            delete styleObj.border;
            delete styleObj.opacity;
          }
        }
      }
    }
  }

  // ─── convertPxToPercent ───────────────────────────────────

  /**
   * 노드의 px 기반 position/size를 부모 크기 대비 퍼센트로 변환.
   * 24×24 좌표계로 설계된 아이콘의 자식 요소들이 컨테이너 크기에 맞게 스케일되도록 한다.
   */
  private convertPxToPercent(node: UINode, parentW: number, parentH: number): void {
    if (!node.styles?.base) return;
    const base = node.styles.base;

    const toPct = (val: unknown, ref: number): string | undefined => {
      if (typeof val !== "string" || !val.endsWith("px")) return undefined;
      const num = parseFloat(val);
      if (isNaN(num)) return undefined;
      return `${parseFloat(((num / ref) * 100).toFixed(2))}%`;
    };

    if (base.left !== undefined) base.left = toPct(base.left, parentW) ?? base.left;
    if (base.top !== undefined) base.top = toPct(base.top, parentH) ?? base.top;
    if (base.width !== undefined) base.width = toPct(base.width, parentW) ?? base.width;
    if (base.height !== undefined) base.height = toPct(base.height, parentH) ?? base.height;
  }

  // ─── pruneUnusedProps ─────────────────────────────────────

  /**
   * variant/boolean props 중 UITree에서 실제로 참조되지 않는 것 제거.
   * slot/string/function props는 항상 유지.
   */
  private _pruneUnusedProps(uiTree: UITree): void {
    const usedPropNames = new Set<string>();

    this.collectReferencedPropsFromNode(uiTree.root, usedPropNames);

    if (uiTree.derivedVars) {
      for (const dv of uiTree.derivedVars) {
        const identifiers = dv.expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) ?? [];
        for (const ident of identifiers) {
          usedPropNames.add(ident);
        }
      }
    }

    uiTree.props = uiTree.props.filter((prop) => {
      if (prop.type === "variant" || prop.type === "boolean") {
        return usedPropNames.has(prop.name);
      }
      return true;
    });
  }

  private collectReferencedPropsFromNode(node: UINode, usedProps: Set<string>): void {
    if (node.visibleCondition) {
      this.collectPropsFromCondition(node.visibleCondition, usedProps);
    }

    if (node.styles?.dynamic) {
      for (const { condition } of node.styles.dynamic) {
        this.collectPropsFromCondition(condition, usedProps);
      }
    }

    if (node.bindings) {
      const { attrs, content, style } = node.bindings;
      if (attrs) {
        for (const binding of Object.values(attrs)) {
          if ("prop" in binding) usedProps.add(binding.prop);
          if ("expr" in binding && typeof binding.expr === "string") {
            const identifiers = binding.expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) ?? [];
            for (const ident of identifiers) usedProps.add(ident);
          }
        }
      }
      if (content && "prop" in content) usedProps.add(content.prop);
      if (style) {
        for (const binding of Object.values(style)) {
          if ("prop" in binding) usedProps.add(binding.prop);
        }
      }
    }

    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.collectReferencedPropsFromNode(child, usedProps);
      }
    }
  }

  private collectPropsFromCondition(condition: ConditionNode, usedProps: Set<string>): void {
    switch (condition.type) {
      case "eq":
      case "neq":
      case "truthy":
        usedProps.add(condition.prop);
        break;
      case "and":
      case "or":
        for (const c of condition.conditions) {
          this.collectPropsFromCondition(c, usedProps);
        }
        break;
      case "not":
        this.collectPropsFromCondition(condition.condition, usedProps);
        break;
    }
  }

  // ─── decomposeDynamicStyles ──────────────────────────────

  /**
   * AND 조건 폭발된 dynamic style을 FD 분해하여 단일 prop 조건으로 축소.
   *
   * Before: AND(size=L, leftIcon=T, rightIcon=F) → {padding:"8px"} (9 entries)
   * After:  eq(size, "Large") → {padding:"8px"} (3 entries)
   *
   * DynamicStyleDecomposer가 pseudo 데이터를 네이티브로 분배하므로,
   * 별도의 pseudo 재부착 로직 없이 decomposer 결과를 직접 사용.
   */
  private decomposeDynamicStyles(node: UINode, diagnostics?: VariantInconsistency[]): void {
    if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
      // Decomposer 전 최적화: pseudo 중복 제거, 빈 entry 제거
      node.styles.dynamic = DynamicStyleOptimizer.optimize(
        node.styles.dynamic,
        node.styles.base
      );

      const { result: decomposed, diagnostics: diag } =
        DynamicStyleDecomposer.decomposeWithDiagnostics(
          node.styles.dynamic,
          node.styles.base
        );

      if (diagnostics && diag.length > 0) {
        for (const d of diag) {
          d.nodeName = node.name;
          d.nodeId = node.id;
          // variants[].nodeId는 DynamicStyleDecomposer가 entry의
          // sourceVariantNodeId를 통해 직접 채워준다 (정공법).
        }
        diagnostics.push(...diag);
      }

      if (decomposed.size > 0) {
        node.styles.dynamic = this.rebuildDynamicFromDecomposed(decomposed);
      }
    }

    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.decomposeDynamicStyles(child, diagnostics);
      }
    }
  }

  /**
   * DynamicStyleDecomposer 결과 Map을 다시 dynamic Array로 역변환.
   *
   * Map<propName, Map<propValue, DecomposedValue>> → Array<{condition, style, pseudo?}>
   */
  private rebuildDynamicFromDecomposed(
    decomposed: DecomposedResult
  ): Array<{ condition: ConditionNode; style: Record<string, string | number>; pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>> }> {
    const result: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
      pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
    }> = [];

    for (const [propName, valueMap] of decomposed) {
      if (propName.includes("+")) {
        // compound prop: "size+tone" → AND(eq(size, s), eq(tone, t))
        const parts = propName.split("+");
        for (const [compoundValue, { style, pseudo }] of valueMap) {
          if (Object.keys(style).length === 0 && !pseudo) continue;
          const values = compoundValue.split("+");
          const conditions = parts.map((p, i) =>
            this.createConditionFromPropValue(p, values[i])
          );
          result.push({
            condition:
              conditions.length === 1
                ? conditions[0]
                : { type: "and", conditions },
            style,
            ...(pseudo && { pseudo }),
          });
        }
      } else {
        // 단일 prop
        for (const [propValue, { style, pseudo }] of valueMap) {
          if (Object.keys(style).length === 0 && !pseudo) continue;
          result.push({
            condition: this.createConditionFromPropValue(propName, propValue),
            style,
            ...(pseudo && { pseudo }),
          });
        }
      }
    }

    return result;
  }

  /**
   * propName + propValue → ConditionNode 변환
   */
  private createConditionFromPropValue(
    propName: string,
    propValue: string
  ): ConditionNode {
    if (propValue === "true") {
      return { type: "truthy", prop: propName };
    }
    if (propValue === "false") {
      return { type: "not", condition: { type: "truthy", prop: propName } };
    }
    return { type: "eq", prop: propName, value: propValue };
  }

  // ─── mergeRedundantDynamicStyles ──────────────────────────

  /**
   * 모든 variant 값이 동일한 dynamic style 항목을 base에 통합하고 dynamic에서 제거.
   */
  private mergeRedundantDynamicStyles(node: UINode): void {
    if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
      const propStyleMap = new Map<string, Map<string, Record<string, string | number>>>();

      for (const { condition, style } of node.styles.dynamic) {
        for (const { propName, propValue } of this.extractEqPropsFromCondition(condition)) {
          if (!propStyleMap.has(propName)) propStyleMap.set(propName, new Map());
          if (!propStyleMap.get(propName)!.has(propValue)) {
            propStyleMap.get(propName)!.set(propValue, style);
          }
        }
      }

      const propsToMerge = new Set<string>();
      for (const [propName, valueStyles] of propStyleMap) {
        if (valueStyles.size >= 2 && this.allStyleObjectsIdentical([...valueStyles.values()])) {
          propsToMerge.add(propName);
        }
      }

      const styleBase = node.styles!.base;
      for (const propName of propsToMerge) {
        const commonStyle = propStyleMap.get(propName)!.values().next().value!;

        // base와 다른 CSS 속성이 있으면 실제 override이므로 병합하지 않음
        // (variant 값이 모두 같더라도 기본 상태와 다르면 의미 있는 조건부 스타일)
        const differsFromBase = Object.entries(commonStyle).some(
          ([key, val]) => !(key in styleBase) || styleBase[key] !== val
        );
        if (differsFromBase) continue;

        Object.assign(node.styles.base, commonStyle);

        const seen = new Set<string>();
        const newDynamic: typeof node.styles.dynamic = [];
        for (const entry of node.styles.dynamic) {
          const newCondition = this.removeEqPropFromCondition(entry.condition, propName);
          if (newCondition !== null) {
            const key = JSON.stringify({ c: newCondition, s: entry.style });
            if (!seen.has(key)) {
              seen.add(key);
              newDynamic.push({
                condition: newCondition,
                style: entry.style,
                ...(entry.pseudo && { pseudo: entry.pseudo }),
              });
            }
          }
        }
        node.styles.dynamic = newDynamic;
      }
    }

    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.mergeRedundantDynamicStyles(child);
      }
    }
  }

  private removeEqPropFromCondition(
    condition: ConditionNode,
    propName: string
  ): ConditionNode | null {
    if (condition.type === "eq" && condition.prop === propName) {
      return null;
    }
    if (condition.type === "and") {
      const newConditions = condition.conditions
        .map((c) => this.removeEqPropFromCondition(c, propName))
        .filter((c): c is ConditionNode => c !== null);
      if (newConditions.length === 0) return null;
      if (newConditions.length === 1) return newConditions[0];
      return { type: "and", conditions: newConditions };
    }
    return condition;
  }

  private extractEqPropsFromCondition(
    condition: ConditionNode
  ): Array<{ propName: string; propValue: string }> {
    if (condition.type === "eq" && typeof condition.value === "string") {
      return [{ propName: condition.prop, propValue: condition.value }];
    }
    if (condition.type === "and") {
      const results: Array<{ propName: string; propValue: string }> = [];
      for (const c of condition.conditions) {
        if (c.type === "eq" && typeof c.value === "string") {
          results.push({ propName: c.prop, propValue: c.value });
        }
      }
      return results;
    }
    return [];
  }

  private allStyleObjectsIdentical(styles: Record<string, string | number>[]): boolean {
    if (styles.length <= 1) return false;
    const first = JSON.stringify(styles[0]);
    return styles.every((s) => JSON.stringify(s) === first);
  }
}
