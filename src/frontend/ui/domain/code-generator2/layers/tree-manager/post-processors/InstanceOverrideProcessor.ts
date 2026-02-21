/**
 * InstanceOverrideProcessor
 *
 * INSTANCE 노드의 override 값을 의존 컴포넌트의 props로 변환
 *
 * 동작:
 * 1. 메인 컴포넌트의 INSTANCE 노드 순회
 * 2. 각 INSTANCE의 override 수집 (fills, characters 등)
 * 3. 해당 의존 컴포넌트의 props에 추가
 */

import type { UITree, UINode, PropDefinition } from "../../../types/types";
import type DataManager from "../../data-manager/DataManager";



interface OverrideInfo {
  propName: string;
  propType: "string";
  nodeId: string; // 원본 노드 ID (바인딩용)
  nodeName: string; // 노드 이름
}

export class InstanceOverrideProcessor {
  constructor(private dataManager: DataManager) {}

  /**
   * 여러 UITree를 받아서 INSTANCE override props 처리
   *
   * @param uiTrees - 모든 컴포넌트의 UITree Map (componentId → UITree)
   * @param mainComponentId - 메인 컴포넌트 ID
   */
  process(uiTrees: Map<string, UITree>, mainComponentId: string): void {
    const mainTree = uiTrees.get(mainComponentId);
    if (!mainTree) return;

    // componentId별로 override 정보 수집
    const overridesByComponent = new Map<string, Map<string, OverrideInfo>>();

    // 메인 트리의 INSTANCE 노드들을 순회하며 override 수집
    this.collectOverrides(mainTree.root, overridesByComponent);

    // 각 의존 컴포넌트에 override props 추가
    for (const [componentId, overrides] of overridesByComponent) {
      const depTree = uiTrees.get(componentId);
      if (!depTree) {
        continue;
      }

      // 중복 제거: 이미 같은 이름의 prop이 있으면 skip
      for (const override of overrides.values()) {
        if (!depTree.props.some(p => p.name === override.propName)) {
          depTree.props.push({
            type: override.propType,
            name: override.propName,
            defaultValue: "",
            required: false,
            sourceKey: "", // Override props는 Figma prop이 아님
          });
        }
      }

      // 의존 컴포넌트 트리에서 해당 노드에 바인딩 추가
      this.addBindingsToTree(depTree.root, overrides);
    }
  }

  /**
   * INSTANCE 노드에서 override 수집
   */
  private collectOverrides(
    node: UINode,
    overridesByComponent: Map<string, Map<string, OverrideInfo>>
  ): void {
    // INSTANCE 노드 (type === "component" && refId가 있음)
    if (node.type === "component" && "refId" in node) {
      const componentId = node.refId;
      const instanceNodeData = this.dataManager.getById(node.id);

      if (instanceNodeData.node) {
        const overrides = this.extractOverridesFromInstance(
          instanceNodeData.node as any,
          componentId
        );

        if (overrides.size > 0) {
          overridesByComponent.set(componentId, overrides);
        }
      }
    }

    // 자식 노드 재귀
    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.collectOverrides(child, overridesByComponent);
      }
    }
  }

  /**
   * INSTANCE 노드에서 override 정보 추출
   *
   * info.document.children이 비어있을 수 있으므로 styleTree 사용
   */
  private extractOverridesFromInstance(
    instanceNode: any,
    componentId: string
  ): Map<string, OverrideInfo> {
    const overrides = new Map<string, OverrideInfo>();

    if (!instanceNode.children) {
      return overrides;
    }

    // 원본 컴포넌트의 styleTree 가져오기
    const { spec, style } = this.dataManager.getById(componentId);
    if (!spec || !style) {
      return overrides;
    }

    // styleTree children을 이름으로 매핑 (v1 방식)
    const styleMap = new Map<string, any>();
    this.buildStyleMapByName(style.children || [], styleMap);

    // styleTree children을 ID로도 매핑 (원본 노드 이름 조회용)
    const styleByIdMap = new Map<string, any>();
    this.buildStyleMapById(style.children || [], styleByIdMap);

    // INSTANCE children 순회하며 override 감지
    this.extractFromChildrenByStyle(instanceNode.children, styleMap, styleByIdMap, overrides);

    return overrides;
  }

  /**
   * styleTree를 이름으로 매핑 (v1 방식)
   */
  private buildStyleMapByName(children: any[], map: Map<string, any>): void {
    for (const child of children) {
      const normalizedName = child.name?.toLowerCase().replace(/\s+/g, "");
      if (normalizedName) {
        map.set(normalizedName, child);
      }
      if (child.children) {
        this.buildStyleMapByName(child.children, map);
      }
    }
  }

  /**
   * styleTree를 ID로 매핑
   */
  private buildStyleMapById(children: any[], map: Map<string, any>): void {
    for (const child of children) {
      if (child.id) {
        map.set(child.id, child);
      }
      if (child.children) {
        this.buildStyleMapById(child.children, map);
      }
    }
  }

  /**
   * INSTANCE children을 styleTree와 비교해서 override 추출
   */
  private extractFromChildrenByStyle(
    children: any[],
    styleMap: Map<string, any>,
    styleByIdMap: Map<string, any>,
    overrides: Map<string, OverrideInfo>
  ): void {
    for (const child of children) {
      // INSTANCE child ID에서 원본 ID 추출
      const originalId = this.getOriginalId(child.id);

      // styleTree에서 원본 노드 찾기
      const originalStyle = styleByIdMap.get(originalId);

      if (originalStyle) {
        const baseName = this.toCamelCase(originalStyle.name);

        // fills override 감지 (cssStyle에서 background 비교)
        if (child.fills && child.fills.length > 0) {
          const childBg = this.extractColorFromFills(child.fills);
          const originalBg = originalStyle.cssStyle?.background;

          if (childBg && childBg !== originalBg) {
            const propName = `${baseName}Bg`;
            overrides.set(propName, {
              propName,
              propType: "string",
              nodeId: originalId,
              nodeName: originalStyle.name,
            });
          }
        }

        // characters override 감지
        if (child.characters !== undefined && child.characters !== "") {
          // styleTree에는 characters가 없으므로, characters가 있으면 override로 간주
          const propName = `${baseName}Text`;
          overrides.set(propName, {
            propName,
            propType: "string",
            nodeId: originalId,
            nodeName: originalStyle.name,
          });
        }
      }

      // 재귀
      if (child.children) {
        this.extractFromChildrenByStyle(child.children, styleMap, styleByIdMap, overrides);
      }
    }
  }

  /**
   * fills 배열에서 색상 추출
   */
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

  /**
   * 의존 컴포넌트 트리에 바인딩 추가
   */
  private addBindingsToTree(
    node: UINode,
    overrides: Map<string, OverrideInfo>
  ): void {
    // 이 노드가 override된 노드인지 확인
    for (const override of overrides.values()) {
      if (node.id === override.nodeId) {
        // 바인딩 추가
        if (!node.bindings) {
          node.bindings = {};
        }

        // fills override → style 바인딩 (추후 구현)
        // characters override → content 바인딩
        if (override.propName.endsWith("Text")) {
          node.bindings.content = { prop: override.propName };
        }
        // fills override는 attrs.style에 바인딩 (추후 구현)
        if (override.propName.endsWith("Bg")) {
          if (!node.bindings.attrs) {
            node.bindings.attrs = {};
          }
          // TODO: style={{ background: props.xxxBg }} 형태로 바인딩
        }
      }
    }

    // 자식 노드 재귀
    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.addBindingsToTree(child, overrides);
      }
    }
  }

  /**
   * 노드 배열을 ID로 매핑 (재귀)
   */
  private buildNodeMap(children: any[], map: Map<string, any>): void {
    for (const child of children) {
      map.set(child.id, child);
      if (child.children) {
        this.buildNodeMap(child.children, map);
      }
    }
  }

  /**
   * INSTANCE child ID에서 원본 ID 추출
   * 예: I704:56;704:29;692:1613 -> 692:1613
   */
  private getOriginalId(instanceId: string): string {
    if (!instanceId.startsWith("I")) return instanceId;
    const parts = instanceId.split(";");
    return parts[parts.length - 1];
  }

  /**
   * 문자열을 camelCase로 변환
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");
  }
}
