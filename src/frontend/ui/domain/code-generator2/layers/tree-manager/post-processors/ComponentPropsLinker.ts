/**
 * ComponentPropsLinker
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
  propType: "string" | "boolean" | "number";
  nodeId: string; // 원본 노드 ID (바인딩용)
  nodeName: string; // 노드 이름
}

export class ComponentPropsLinker {
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
          // 원본 노드에서 기본값 추출
          let defaultValue: any = "";
          const originalNodeData = this.dataManager.getById(override.nodeId);
          if (override.propType === "boolean") {
            // visible override: 원본 visible 값을 기본값으로
            // Figma API: visible 생략 시 true로 간주
            const visible = (originalNodeData.node as any)?.visible;
            defaultValue = visible !== undefined ? visible : true;
          } else if (override.propType === "number") {
            const opacity = (originalNodeData.node as any)?.opacity;
            defaultValue = opacity !== undefined ? String(opacity) : "1";
          } else if (override.propName.endsWith("Text")) {
            const chars = (originalNodeData.node as any)?.characters;
            if (chars !== undefined) {
              defaultValue = chars;
            }
          } else if (override.propName.endsWith("Bg")) {
            const fills = (originalNodeData.node as any)?.fills;
            if (fills) {
              const color = this.extractColorFromFills(fills);
              if (color) defaultValue = color;
            }
          } else if (override.propName.endsWith("Opacity")) {
            const opacity = (originalNodeData.node as any)?.opacity;
            defaultValue = opacity !== undefined ? String(opacity) : "1";
          }

          depTree.props.push({
            type: override.propType,
            name: override.propName,
            defaultValue,
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
   * INSTANCE 노드에서 override 수집 및 저장
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
          // 의존 컴포넌트 props 정의용 (중복 제거 위해 Map 사용)
          if (!overridesByComponent.has(componentId)) {
            overridesByComponent.set(componentId, new Map());
          }
          const componentOverrides = overridesByComponent.get(componentId)!;
          for (const [propName, info] of overrides) {
            componentOverrides.set(propName, info);
          }

          // 메인 트리의 이 INSTANCE 노드에 실제 override 값 저장
          const overrideProps: Record<string, string> = {};
          for (const [propName, info] of overrides) {
            const value = this.extractOverrideValue(instanceNodeData.node as any, info);
            if (value !== null) {
              overrideProps[propName] = value;
            }
          }
          if (Object.keys(overrideProps).length > 0) {
            node.overrideProps = overrideProps;
          }
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

        // visible override 감지 (v1 호환)
        // Figma API: visible이 true이면 property를 아예 생략함
        {
          const originalNode = this.dataManager.getById(originalId).node;
          const originalVisible = (originalNode as any)?.visible;
          // child.visible이 undefined면 true로 간주 (Figma convention)
          const childVisible = child.visible !== undefined ? child.visible : true;
          // 원본 visible이 undefined이면 true로 간주 (Figma convention)
          const origVisible = originalVisible !== undefined ? originalVisible : true;
          if (origVisible !== childVisible) {
            const capName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
            const propName = `show${capName}`;
            overrides.set(propName, {
              propName,
              propType: "boolean",
              nodeId: originalId,
              nodeName: originalStyle.name,
            });
          }
        }

        // opacity override 감지 (v1 호환)
        {
          const originalNode = this.dataManager.getById(originalId).node;
          const originalOpacity = (originalNode as any)?.opacity;
          // Figma: opacity 생략 시 1.0
          const childOpacity = child.opacity !== undefined ? child.opacity : 1;
          const origOpacity = originalOpacity !== undefined ? originalOpacity : 1;
          if (childOpacity !== origOpacity) {
            const propName = `${baseName}Opacity`;
            overrides.set(propName, {
              propName,
              propType: "string",
              nodeId: originalId,
              nodeName: originalStyle.name,
            });
          }
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

        // characters override → content 바인딩
        if (override.propName.endsWith("Text")) {
          node.bindings.content = { prop: override.propName };
        }
        // fills override → style 바인딩
        if (override.propName.endsWith("Bg")) {
          if (!node.bindings.style) {
            node.bindings.style = {};
          }
          node.bindings.style.background = { prop: override.propName };
        }
        // visible override → visibleCondition 바인딩
        if (override.propName.startsWith("show")) {
          node.visibleCondition = {
            type: "truthy",
            prop: override.propName,
          } as any;
        }
        // opacity override → style 바인딩
        if (override.propName.endsWith("Opacity")) {
          if (!node.bindings.style) {
            node.bindings.style = {};
          }
          node.bindings.style.opacity = { prop: override.propName };
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
   * 숫자로 시작하면 _ 접두사 추가 (유효한 JavaScript 식별자로 변환)
   */
  private toCamelCase(str: string): string {
    const result = str
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");

    // JavaScript 식별자는 숫자로 시작할 수 없으므로 _ 접두사 추가
    if (/^[0-9]/.test(result)) {
      return "_" + result;
    }

    return result;
  }

  /**
   * INSTANCE 노드에서 실제 override 값 추출
   */
  private extractOverrideValue(instanceNode: any, info: OverrideInfo): string | null {
    // INSTANCE children에서 해당 노드 찾기
    const targetNode = this.findNodeById(instanceNode.children || [], info.nodeId);
    if (!targetNode) return null;

    // propName에서 타입 추론
    if (info.propName.endsWith("Bg")) {
      // fills override
      if (targetNode.fills && targetNode.fills.length > 0) {
        return this.extractColorFromFills(targetNode.fills);
      }
    } else if (info.propName.endsWith("Text")) {
      // characters override
      if (targetNode.characters !== undefined) {
        return targetNode.characters;
      }
    } else if (info.propName.startsWith("show")) {
      // visible override (Figma: visible 생략 시 true)
      const visible = targetNode.visible !== undefined ? targetNode.visible : true;
      return String(visible);
    } else if (info.propName.endsWith("Opacity")) {
      // opacity override
      if (targetNode.opacity !== undefined) {
        return String(targetNode.opacity);
      }
    }

    return null;
  }

  /**
   * children에서 ID로 노드 찾기 (재귀)
   */
  private findNodeById(children: any[], nodeId: string): any | null {
    for (const child of children) {
      const originalId = this.getOriginalId(child.id);
      if (originalId === nodeId) {
        return child;
      }
      if (child.children) {
        const found = this.findNodeById(child.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  }
}
