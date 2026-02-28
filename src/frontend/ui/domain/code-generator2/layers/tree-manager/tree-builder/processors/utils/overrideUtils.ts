/**
 * Override 유틸리티
 *
 * INSTANCE 노드의 override 비교를 위한 공통 유틸 함수
 */

import type { InternalTree, InstanceOverride } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * 인스턴스들이 서로 다른 override 값을 가지는지 확인
 *
 * 인스턴스들이 fills, characters 등의 override를 가지고
 * 그 값들이 서로 다르면 Array Slot으로 그룹화하지 않음
 * (개별 컴포넌트 호출로 override props를 전달해야 함)
 */
export function hasDistinctOverrides(
  nodes: InternalTree[],
  dataManager: DataManager
): boolean {
  // 각 노드의 override 값 수집
  const overrideValues: Array<{ fills: string; characters: string }> = [];

  for (const node of nodes) {
    const { node: figmaNode } = dataManager.getById(node.id);
    if (!figmaNode) continue;

    const instanceNode = figmaNode as any;

    // fills와 characters 값을 수집
    let fillsValue = "";
    let charactersValue = "";

    // children에서 fills/characters 추출
    if (instanceNode.children && Array.isArray(instanceNode.children)) {
      for (const child of instanceNode.children) {
        // fills (배경색)
        if (child.fills && Array.isArray(child.fills) && child.fills.length > 0) {
          const fill = child.fills[0];
          if (fill.type === "SOLID" && fill.color) {
            const { r, g, b } = fill.color;
            fillsValue += `${r},${g},${b};`;
          }
        }
        // characters (텍스트)
        if (child.characters !== undefined && child.characters !== "") {
          charactersValue += `${child.characters};`;
        }
      }
    }

    overrideValues.push({ fills: fillsValue, characters: charactersValue });
  }

  // 최소 2개 이상의 노드가 필요
  if (overrideValues.length < 2) {
    return false;
  }

  // 모든 값이 동일한지 확인
  const firstFills = overrideValues[0].fills;
  const firstChars = overrideValues[0].characters;

  for (let i = 1; i < overrideValues.length; i++) {
    if (
      overrideValues[i].fills !== firstFills ||
      overrideValues[i].characters !== firstChars
    ) {
      // 서로 다른 override 값이 있음
      return true;
    }
  }

  return false;
}

/**
 * INSTANCE InternalNode에서 override 감지
 *
 * StyleProcessor 이후에 호출되어야 함 (styles.dynamic 확인 필요)
 *
 * raw Figma 데이터와 dependency styleTree를 비교하되,
 * styles.dynamic에 이미 포함된 속성은 variant 병합이 처리하므로 스킵
 */
export function detectInstanceOverrides(
  instanceNode: InternalTree,
  dataManager: DataManager
): InstanceOverride[] {
  if (!instanceNode.refId) return [];

  const { style } = dataManager.getById(instanceNode.refId);
  if (!style?.children) return [];

  const { node: rawInstance } = dataManager.getById(instanceNode.id);
  if (!(rawInstance as any)?.children) return [];

  const styleByIdMap = new Map<string, any>();
  buildStyleMapById(style.children, styleByIdMap);

  const internalChildMap = new Map<string, InternalTree>();
  buildInternalChildMap(instanceNode.children, internalChildMap);

  const overrides: InstanceOverride[] = [];
  detectFromRawChildren(
    (rawInstance as any).children,
    styleByIdMap,
    internalChildMap,
    dataManager,
    overrides
  );

  return overrides;
}

function detectFromRawChildren(
  rawChildren: any[],
  styleByIdMap: Map<string, any>,
  internalChildMap: Map<string, InternalTree>,
  dataManager: DataManager,
  overrides: InstanceOverride[]
): void {
  for (const rawChild of rawChildren) {
    const originalId = getOriginalId(rawChild.id);
    const originalStyle = styleByIdMap.get(originalId);
    if (!originalStyle) continue;

    const internalChild = internalChildMap.get(rawChild.id);
    const baseName = toCamelCase(originalStyle.name);

    // fills override
    if (rawChild.fills && rawChild.fills.length > 0) {
      const childBg = extractColorFromFills(rawChild.fills);
      const originalBg = originalStyle.cssStyle?.background;

      if (childBg && childBg !== originalBg) {
        const isDynamic = internalChild?.styles?.dynamic?.some(
          (d) => "background" in d.style
        );
        if (!isDynamic) {
          overrides.push({
            propName: `${baseName}Bg`,
            propType: "string",
            nodeId: originalId,
            nodeName: originalStyle.name,
            value: childBg,
          });
        }
      }
    }

    // characters override
    if (rawChild.characters !== undefined && rawChild.characters !== "") {
      const isDynamic = internalChild?.styles?.dynamic?.some(
        (d) => "color" in d.style || "font-size" in d.style
      );
      if (!isDynamic) {
        overrides.push({
          propName: `${baseName}Text`,
          propType: "string",
          nodeId: originalId,
          nodeName: originalStyle.name,
          value: rawChild.characters,
        });
      }
    }

    // visible override
    {
      const originalNode = dataManager.getById(originalId).node;
      const originalVisible =
        (originalNode as any)?.visible !== undefined
          ? (originalNode as any).visible
          : true;
      const childVisible =
        rawChild.visible !== undefined ? rawChild.visible : true;

      if (originalVisible !== childVisible) {
        const hasVisibleCondition = !!internalChild?.visibleCondition;
        if (!hasVisibleCondition) {
          const capName =
            baseName.charAt(0).toUpperCase() + baseName.slice(1);
          overrides.push({
            propName: `show${capName}`,
            propType: "boolean",
            nodeId: originalId,
            nodeName: originalStyle.name,
            value: String(childVisible),
          });
        }
      }
    }

    // opacity override
    {
      const originalNode = dataManager.getById(originalId).node;
      const originalOpacity =
        (originalNode as any)?.opacity !== undefined
          ? (originalNode as any).opacity
          : 1;
      const childOpacity =
        rawChild.opacity !== undefined ? rawChild.opacity : 1;

      if (childOpacity !== originalOpacity) {
        const isDynamic = internalChild?.styles?.dynamic?.some(
          (d) => "opacity" in d.style
        );
        if (!isDynamic) {
          overrides.push({
            propName: `${baseName}Opacity`,
            propType: "string",
            nodeId: originalId,
            nodeName: originalStyle.name,
            value: String(childOpacity),
          });
        }
      }
    }

    // 재귀
    if (rawChild.children) {
      detectFromRawChildren(
        rawChild.children,
        styleByIdMap,
        internalChildMap,
        dataManager,
        overrides
      );
    }
  }
}

// ============================================================================
// Helper functions
// ============================================================================

function buildStyleMapById(children: any[], map: Map<string, any>): void {
  for (const child of children) {
    if (child.id) {
      map.set(child.id, child);
    }
    if (child.children) {
      buildStyleMapById(child.children, map);
    }
  }
}

function buildInternalChildMap(
  children: InternalTree[],
  map: Map<string, InternalTree>
): void {
  for (const child of children) {
    map.set(child.id, child);
    if (child.children) {
      buildInternalChildMap(child.children, map);
    }
  }
}

function getOriginalId(instanceId: string): string {
  if (!instanceId.startsWith("I")) return instanceId;
  const parts = instanceId.split(";");
  return parts[parts.length - 1];
}

function toCamelCase(str: string): string {
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
  if (/^[0-9]/.test(result)) {
    return "_" + result;
  }
  return result;
}

function extractColorFromFills(fills: any[]): string | null {
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
