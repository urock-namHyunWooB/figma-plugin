/**
 * ComponentPropsLinker
 *
 * UITree에 이미 감지된 override 정보를 읽어서
 * 의존 컴포넌트의 props/bindings로 연결하는 순수 링커
 *
 * Override 감지는 TreeBuilder 레이어(overrideUtils.detectInstanceOverrides)에서 수행
 */

import type { UITree, UINode, InstanceOverride, ComponentNode } from "../../../types/types";
import type DataManager from "../../data-manager/DataManager";

export class ComponentPropsLinker {
  constructor(private dataManager: DataManager) {}

  /**
   * 여러 UITree를 받아서 INSTANCE override props 연결
   *
   * @param uiTrees - 모든 컴포넌트의 UITree Map (componentId → UITree)
   * @param mainComponentId - 메인 컴포넌트 ID
   */
  process(uiTrees: Map<string, UITree>, mainComponentId: string): void {
    const mainTree = uiTrees.get(mainComponentId);
    if (!mainTree) return;

    const mainPropNames = new Set(mainTree.props.map((p) => p.name));

    // 1. componentProperties 바인딩 (variant props → attrs)
    this.bindComponentProperties(mainTree.root, mainPropNames);

    // 2. override 정보 수집 (TreeBuilder가 이미 감지한 결과)
    const overridesByComponent = new Map<string, Map<string, InstanceOverride>>();
    this.collectOverrideMeta(mainTree.root, overridesByComponent);

    // 3. 의존 컴포넌트에 props/bindings 연결
    for (const [componentId, overrides] of overridesByComponent) {
      const depTree = uiTrees.get(componentId);
      if (!depTree) continue;

      for (const override of overrides.values()) {
        if (depTree.props.some((p) => p.name === override.propName)) continue;

        const defaultValue = this.extractDefaultValue(override);

        depTree.props.push({
          type: override.propType,
          name: override.propName,
          defaultValue,
          required: false,
          sourceKey: "",
        });
      }

      this.addBindingsToTree(depTree.root, overrides);
    }
  }

  /**
   * INSTANCE의 componentProperties → bindings.attrs 매핑
   */
  private bindComponentProperties(
    node: UINode,
    mainPropNames: Set<string>
  ): void {
    if (node.type === "component" && "refId" in node) {
      const instanceNodeData = this.dataManager.getById(node.id);
      const figmaNode = (instanceNodeData.node as any);

      if (figmaNode?.componentProperties) {
        const attrsToAdd: Record<string, { prop: string }> = {};
        for (const propKey of Object.keys(figmaNode.componentProperties)) {
          const camelKey =
            propKey.charAt(0).toLowerCase() + propKey.slice(1);
          if (mainPropNames.has(camelKey)) {
            attrsToAdd[camelKey] = { prop: camelKey };
          }
        }
        if (Object.keys(attrsToAdd).length > 0) {
          if (!node.bindings) node.bindings = {};
          if (!node.bindings.attrs) node.bindings.attrs = {};
          Object.assign(node.bindings.attrs, attrsToAdd);
        }
      }
    }

    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.bindComponentProperties(child, mainPropNames);
      }
    }
  }

  /**
   * UITree에서 overrideMeta 수집
   */
  private collectOverrideMeta(
    node: UINode,
    overridesByComponent: Map<string, Map<string, InstanceOverride>>
  ): void {
    if (
      node.type === "component" &&
      "refId" in node &&
      (node as ComponentNode).overrideMeta
    ) {
      const componentNode = node as ComponentNode;
      const componentId = componentNode.refId;

      if (!overridesByComponent.has(componentId)) {
        overridesByComponent.set(componentId, new Map());
      }
      const componentOverrides = overridesByComponent.get(componentId)!;

      for (const override of componentNode.overrideMeta!) {
        componentOverrides.set(override.propName, override);
      }
    }

    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.collectOverrideMeta(child, overridesByComponent);
      }
    }
  }

  /**
   * 원본 노드에서 기본값 추출
   */
  private extractDefaultValue(override: InstanceOverride): any {
    const originalNodeData = this.dataManager.getById(override.nodeId);

    if (override.propType === "boolean") {
      const visible = (originalNodeData.node as any)?.visible;
      return visible !== undefined ? visible : true;
    }

    if (override.propName.endsWith("Text")) {
      const chars = (originalNodeData.node as any)?.characters;
      return chars !== undefined ? chars : "";
    }

    if (override.propName.endsWith("Bg")) {
      const fills = (originalNodeData.node as any)?.fills;
      if (fills) {
        const color = this.extractColorFromFills(fills);
        if (color) return color;
      }
    }

    if (override.propName.endsWith("Opacity")) {
      const opacity = (originalNodeData.node as any)?.opacity;
      return opacity !== undefined ? String(opacity) : "1";
    }

    return "";
  }

  /**
   * 의존 컴포넌트 트리에 바인딩 추가
   */
  private addBindingsToTree(
    node: UINode,
    overrides: Map<string, InstanceOverride>
  ): void {
    for (const override of overrides.values()) {
      if (node.id === override.nodeId) {
        if (!node.bindings) node.bindings = {};

        if (override.propName.endsWith("Text")) {
          node.bindings.content = { prop: override.propName };
        }
        if (override.propName.endsWith("Bg")) {
          if (!node.bindings.style) node.bindings.style = {};
          // vector 노드(VECTOR, BOOLEAN_OPERATION 등)는 background가 아닌 fill로 바인딩
          const styleKey = node.type === "vector" ? "fill" : "background";
          node.bindings.style[styleKey] = { prop: override.propName };
        }
        if (override.propName.startsWith("show")) {
          node.visibleCondition = {
            type: "truthy",
            prop: override.propName,
          } as any;
        }
        if (override.propName.endsWith("Opacity")) {
          if (!node.bindings.style) node.bindings.style = {};
          node.bindings.style.opacity = { prop: override.propName };
        }
      }
    }

    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.addBindingsToTree(child, overrides);
      }
    }
  }

  private extractColorFromFills(fills: any[]): string | null {
    if (!fills || fills.length === 0) return null;
    const fill = fills[0];
    if (fill.type !== "SOLID" || !fill.color) return null;
    const { r, g, b, a } = fill.color;
    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");
    if (a !== undefined && a < 1) {
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }
}
