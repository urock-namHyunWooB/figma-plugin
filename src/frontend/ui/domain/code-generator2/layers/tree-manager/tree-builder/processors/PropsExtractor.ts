import { PropDefinition } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * Figma componentPropertyDefinitions 구조
 */
interface FigmaPropertyDef {
  type: "VARIANT" | "BOOLEAN" | "TEXT" | "INSTANCE_SWAP";
  defaultValue?: string | boolean;
  variantOptions?: string[];
}

/**
 * PropsExtractor
 *
 * componentPropertyDefinitions → PropDefinition[] 변환
 *
 * 변환 규칙:
 * 1. VARIANT (True/False만) → BooleanPropDefinition
 * 2. VARIANT (일반) → VariantPropDefinition
 * 3. BOOLEAN → BooleanPropDefinition
 * 4. TEXT → StringPropDefinition
 * 5. INSTANCE_SWAP → SlotPropDefinition
 *
 * 특수 처리:
 * - "State" prop은 제외 (CSS pseudo-class로 변환됨)
 */
export class PropsExtractor {
  private readonly dataManager: DataManager;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * componentPropertyDefinitions에서 PropDefinition[] 추출
   */
  public extract(): PropDefinition[] {
    const propDefs = this.dataManager.getComponentPropertyDefinitions();
    if (!propDefs) return [];

    const result: PropDefinition[] = [];

    for (const [sourceKey, def] of Object.entries(propDefs)) {
      const figmaDef = def as FigmaPropertyDef;

      // State 관련 prop은 제외 (CSS pseudo-class 변환 대상)
      if (this.isStateProp(sourceKey)) {
        continue;
      }

      const propDef = this.convertToPropDefinition(sourceKey, figmaDef);
      if (propDef) {
        result.push(propDef);
      }
    }

    return result;
  }

  /**
   * Figma property definition → PropDefinition 변환
   */
  private convertToPropDefinition(
    sourceKey: string,
    figmaDef: FigmaPropertyDef
  ): PropDefinition | null {
    const name = this.normalizePropName(sourceKey);

    switch (figmaDef.type) {
      case "VARIANT": {
        // Boolean variant 체크 (True/False 또는 true/false만 있는 경우)
        if (this.isBooleanVariant(figmaDef)) {
          // Icon/slot 패턴은 slot 타입으로 변환 (React.ReactNode)
          if (this.isSlotPattern(name)) {
            return {
              type: "slot",
              name,
              sourceKey,
              required: false,
              defaultValue: null,
            };
          }

          const defaultVal =
            typeof figmaDef.defaultValue === "string"
              ? figmaDef.defaultValue.toLowerCase() === "true"
              : false;

          return {
            type: "boolean",
            name,
            sourceKey,
            required: false,
            defaultValue: defaultVal,
          };
        }

        // 일반 variant
        return {
          type: "variant",
          name,
          sourceKey,
          required: false,
          options: figmaDef.variantOptions || [],
          defaultValue: figmaDef.defaultValue as string | undefined,
        };
      }

      case "BOOLEAN": {
        return {
          type: "boolean",
          name,
          sourceKey,
          required: false,
          defaultValue: figmaDef.defaultValue as boolean | undefined,
        };
      }

      case "TEXT": {
        return {
          type: "string",
          name,
          sourceKey,
          required: false,
          defaultValue: figmaDef.defaultValue as string | undefined,
        };
      }

      case "INSTANCE_SWAP": {
        return {
          type: "slot",
          name,
          sourceKey,
          required: false,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Boolean variant인지 확인 (True/False 또는 true/false만 있는 경우)
   */
  private isBooleanVariant(figmaDef: FigmaPropertyDef): boolean {
    if (figmaDef.type !== "VARIANT") return false;
    if (!figmaDef.variantOptions) return false;

    const options = figmaDef.variantOptions;
    if (options.length !== 2) return false;

    // 대소문자 무시 정규화
    const normalized = options.map((o) => o.toLowerCase()).sort();
    return normalized[0] === "false" && normalized[1] === "true";
  }

  /**
   * State 관련 prop인지 확인
   * "State", "states", "state" 등을 모두 감지
   */
  private isStateProp(sourceKey: string): boolean {
    // # 이후 노드 ID 제거
    const cleanKey = sourceKey.split("#")[0].trim();
    const lowerKey = cleanKey.toLowerCase();
    return lowerKey === "state" || lowerKey === "states";
  }

  /**
   * Slot 패턴인지 확인 (icon, image 등 React.ReactNode를 받을 수 있는 패턴)
   */
  private isSlotPattern(propName: string): boolean {
    const lowerName = propName.toLowerCase();
    // icon, image, avatar 등은 slot으로 변환
    return (
      lowerName.includes("icon") ||
      lowerName.includes("image") ||
      lowerName.includes("avatar") ||
      lowerName.includes("thumbnail") ||
      lowerName.includes("prefix") ||
      lowerName.includes("suffix")
    );
  }

  /**
   * Prop 이름 정규화
   * "Left Icon#89:6" → "leftIcon"
   * "icon left#373:58" → "iconLeft"
   * "type" → "customType" (native prop 충돌 방지)
   */
  private normalizePropName(sourceKey: string): string {
    // 0. 제어 문자 제거 (0x00-0x1F, 0x7F) - Figma export 데이터에 포함될 수 있음
    const sanitized = sourceKey.replace(/[\x00-\x1F\x7F]/g, "");

    // 1. # 이후 노드 ID 제거
    const cleanKey = sanitized.split("#")[0].trim();

    // 2. 첫 단어는 소문자, 나머지는 각 단어 첫 글자 대문자 (camelCase)
    let propName = cleanKey
      .split(/\s+/)
      .map((word, index) => {
        if (index === 0) {
          return word.charAt(0).toLowerCase() + word.slice(1);
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join("");

    // 3. Native HTML prop과 충돌하는 이름은 custom 접두사 추가
    if (this.isNativePropConflict(propName)) {
      propName = "custom" + propName.charAt(0).toUpperCase() + propName.slice(1);
    }

    return propName;
  }

  /**
   * Native HTML prop과 충돌하는 이름인지 확인
   */
  private isNativePropConflict(propName: string): boolean {
    // button/input 등의 native HTML attributes
    const nativeProps = new Set([
      "type",       // button type
      "name",       // form element name
      "value",      // input value
      "checked",    // checkbox checked
      "disabled",   // disabled state (보통 State prop으로 처리되어 제외됨)
      "required",   // required attribute
      "placeholder",// input placeholder
      "href",       // anchor href
      "src",        // image src
      "alt",        // image alt
    ]);

    return nativeProps.has(propName);
  }
}
