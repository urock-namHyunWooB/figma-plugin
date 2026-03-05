/**
 * UITreeOptimizer
 *
 * UITree 후처리 최적화:
 * 1. mergeRedundantDynamicStyles — 모든 variant에서 동일한 dynamic style을 base에 병합
 * 2. pruneUnusedProps — 트리에서 참조되지 않는 variant/boolean props 제거
 * 3. makeRootFlexible — dependency 루트의 고정 크기를 100%로 변환
 *
 * CodeEmitter가 아닌 TreeManager 단계에서 실행되어,
 * 어떤 emitter(React/Vue/Svelte)를 사용하든 동일한 최적화가 적용된다.
 */

import type { UITree, UINode, ConditionNode } from "../../../types/types";

export class UITreeOptimizer {
  /**
   * 메인 트리 최적화 (dynamic styles 병합)
   */
  optimizeMain(tree: UITree): void {
    this.mergeRedundantDynamicStyles(tree.root);
  }

  /**
   * 의존 트리 최적화 (dynamic styles 병합 + 루트 유연화)
   */
  optimizeDependency(tree: UITree): void {
    this.mergeRedundantDynamicStyles(tree.root);
    this.makeRootFlexible(tree);
  }

  /**
   * 미사용 props 제거 (별도 호출 — 현재 비활성)
   * 활성화 시 variant/boolean props 중 트리에서 참조되지 않는 것을 제거.
   */
  pruneUnusedProps(tree: UITree): void {
    this._pruneUnusedProps(tree);
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

    if (base.width && typeof base.width === "string" && base.width.endsWith("px")) {
      base.width = "100%";
    }
    if (base.height && typeof base.height === "string" && base.height.endsWith("px")) {
      base.height = "100%";
    }

    // 루트와 동일한 크기의 직접 자식도 100%로 변환하고,
    // 그 자식의 px 기반 위치/크기를 원래 크기 대비 퍼센트로 변환
    // (예: 아이콘 컴포넌트의 Shape 레이어가 루트와 같은 24×24px인 경우)
    if ("children" in root && root.children && originalWidth && originalHeight) {
      const parentW = parseFloat(originalWidth as string);
      const parentH = parseFloat(originalHeight as string);

      for (const child of root.children) {
        if (!child.styles?.base) continue;
        const childBase = child.styles.base;
        if (childBase.width === originalWidth && childBase.height === originalHeight) {
          childBase.width = "100%";
          childBase.height = "100%";

          // 손자 노드(grandchild)의 px 위치/크기를 퍼센트로 변환
          if ("children" in child && child.children && !isNaN(parentW) && !isNaN(parentH)) {
            for (const grandchild of child.children) {
              this.convertPxToPercent(grandchild, parentW, parentH);
            }
          }
        }
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
        this.collectEqOnlyPropsFromCondition(condition, usedProps);
      }
    }

    if (node.bindings) {
      const { attrs, content, style } = node.bindings;
      if (attrs) {
        for (const binding of Object.values(attrs)) {
          if ("prop" in binding) usedProps.add(binding.prop);
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

  private collectEqOnlyPropsFromCondition(condition: ConditionNode, usedProps: Set<string>): void {
    if (condition.type === "eq") {
      usedProps.add(condition.prop);
    } else if (condition.type === "and" || condition.type === "or") {
      for (const c of condition.conditions) {
        this.collectEqOnlyPropsFromCondition(c, usedProps);
      }
    } else if (condition.type === "not") {
      this.collectEqOnlyPropsFromCondition(condition.condition, usedProps);
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

      for (const propName of propsToMerge) {
        const commonStyle = propStyleMap.get(propName)!.values().next().value!;

        // base와 다른 CSS 속성이 있으면 실제 override이므로 병합하지 않음
        // (variant 값이 모두 같더라도 기본 상태와 다르면 의미 있는 조건부 스타일)
        const differsFromBase = Object.entries(commonStyle).some(
          ([key, val]) => !(key in node.styles.base) || node.styles.base[key] !== val
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
              newDynamic.push({ condition: newCondition, style: entry.style });
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
