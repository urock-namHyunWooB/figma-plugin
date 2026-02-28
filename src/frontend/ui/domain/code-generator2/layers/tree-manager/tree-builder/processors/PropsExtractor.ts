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
   *
   * v1 방식:
   * 1. componentPropertyDefinitions 사용 (COMPONENT_SET)
   * 2. 없으면 componentProperties 변환 (COMPONENT variant)
   * 3. 없으면 variant 이름에서 추론 (COMPONENT variant)
   * 4. 없으면 mergedNodes의 variantName에서 추론 (variant 병합된 경우)
   * 5. componentPropertyReferences에서 참조된 props 추출
   *
   * @param node - 빌드 중인 노드 (dependency 빌드 시 필요)
   * @param mergedNodes - VariantMerger에서 생성한 mergedNodes (variant props 추출용)
   */
  public extract(node?: SceneNode, mergedNodes?: any[]): PropDefinition[] {
    // node가 전달되면 그걸 사용, 아니면 dataManager의 document 사용
    const targetNode = node || this.dataManager.getDocument();

    // targetNode에서 직접 componentPropertyDefinitions 읽기
    let propDefs = (targetNode as any).componentPropertyDefinitions || null;

    // componentPropertyDefinitions가 없으면 componentProperties 변환
    if (!propDefs) {
      const componentProps = (targetNode as any).componentProperties || null;
      if (componentProps) {
        propDefs = this.convertComponentPropertiesToDefinitions(componentProps);
      }
    }

    // 둘 다 없으면 variant 이름에서 추론 (COMPONENT variant의 경우)
    if (!propDefs) {
      propDefs =
        this.inferComponentPropertyDefinitionsFromVariantName(targetNode);
    }

    // 그래도 없으면 mergedNodes의 variantName에서 추론 (variant 병합된 경우)
    if (!propDefs && mergedNodes && mergedNodes.length > 0) {
      propDefs = this.inferComponentPropertyDefinitionsFromMergedNodes(mergedNodes);
    }

    if (!propDefs) {
      // 그래도 없으면 componentPropertyReferences에서만 추출
      return this.extractFromReferencesOnly(targetNode);
    }

    const result: PropDefinition[] = [];
    const existingSourceKeys = new Set<string>();
    const existingNames = new Set<string>();

    for (const [sourceKey, def] of Object.entries(propDefs)) {
      const figmaDef = def as FigmaPropertyDef;

      // State prop 제외 로직은 ButtonHeuristic.removeStateProp()에서 처리
      // PropsExtractor는 모든 prop을 그대로 통과시킴

      const propDef = this.convertToPropDefinition(sourceKey, figmaDef);
      if (propDef) {
        // sourceKey 또는 name 중복 체크
        if (
          !existingSourceKeys.has(sourceKey) &&
          !existingNames.has(propDef.name)
        ) {
          result.push(propDef);
          existingSourceKeys.add(sourceKey);
          existingNames.add(propDef.name);
        }
      }
    }

    // componentPropertyReferences에서 참조된 props 추가 (중복 제외)
    const referencedProps = this.extractPropsFromPropertyReferences(
      existingSourceKeys,
      existingNames,
      targetNode
    );
    result.push(...referencedProps);

    return result;
  }

  /**
   * componentProperties를 componentPropertyDefinitions 형식으로 변환
   *
   * COMPONENT variant는 componentPropertyDefinitions가 없고 componentProperties만 있음
   */
  private convertComponentPropertiesToDefinitions(
    componentProperties: Record<string, any>
  ): Record<string, FigmaPropertyDef> {
    const propDefs: Record<string, FigmaPropertyDef> = {};

    for (const [key, value] of Object.entries(componentProperties)) {
      // VARIANT 타입은 INSTANCE에서 사용되지 않으므로 제외
      if (value.type === "VARIANT") {
        continue;
      }

      propDefs[key] = {
        type: value.type,
        defaultValue: value.value,
      };
    }

    return propDefs;
  }

  /**
   * variant 이름에서 componentPropertyDefinitions 추론
   *
   * COMPONENT variant는 componentPropertyDefinitions가 null인 경우가 많음
   * 이 경우 document.name ("State=Normal, Guide Text=False")을 파싱해서 props 추론
   *
   * v1의 DependencyManager._inferComponentPropertyDefinitions() 참고
   */
  private inferComponentPropertyDefinitionsFromVariantName(
    node: SceneNode
  ): Record<string, FigmaPropertyDef> | null {
    const document = node;

    // COMPONENT 타입이 아니면 추론 불가
    if (document.type !== "COMPONENT") {
      return null;
    }

    const variantName = document.name;

    if (!variantName || !variantName.includes("=")) {
      return null;
    }

    const propDefs: Record<string, FigmaPropertyDef> = {};

    // "State=Normal, Guide Text=False" 형식 파싱
    const propPairs = variantName.split(",").map((s) => s.trim());

    for (const pair of propPairs) {
      const [propName, propValue] = pair.split("=").map((s) => s.trim());

      if (propName && propValue) {
        // 현재 variant의 값만 알 수 있으므로 variantOptions는 현재 값만 포함
        propDefs[propName] = {
          type: "VARIANT",
          defaultValue: propValue,
          variantOptions: [propValue], // 단일 variant이므로 현재 값만
        };
      }
    }

    if (Object.keys(propDefs).length > 0) {
      return propDefs;
    }

    return null;
  }

  /**
   * mergedNodes의 variantName에서 componentPropertyDefinitions 추론
   *
   * VariantMerger에서 병합된 경우, mergedNodes[i].variantName에 variant 정보가 있음
   * 예: "Platform=Normal, Size=Medium, Active=False"
   *
   * 모든 mergedNode의 variantName에서 가능한 모든 prop과 값을 추출하여
   * variantOptions를 구성
   */
  private inferComponentPropertyDefinitionsFromMergedNodes(
    mergedNodes: any[]
  ): Record<string, FigmaPropertyDef> | null {
    const propDefs: Record<string, FigmaPropertyDef> = {};

    // 각 mergedNode의 variantName에서 props 추출
    for (const merged of mergedNodes) {
      const variantName = merged.variantName || "";

      if (!variantName || !variantName.includes("=")) {
        continue;
      }

      // "Platform=Normal, Size=Medium, Active=False" 형식 파싱
      const propPairs = variantName.split(",").map((s: string) => s.trim());

      for (const pair of propPairs) {
        const [propName, propValue] = pair.split("=").map((s: string) => s.trim());

        if (propName && propValue) {
          if (!propDefs[propName]) {
            propDefs[propName] = {
              type: "VARIANT",
              variantOptions: [],
            };
          }

          // variantOptions에 값 추가 (중복 제외)
          const options = propDefs[propName].variantOptions || [];
          if (!options.includes(propValue)) {
            options.push(propValue);
          }
          propDefs[propName].variantOptions = options;

          // 첫 번째 값을 defaultValue로 설정
          if (!propDefs[propName].defaultValue) {
            propDefs[propName].defaultValue = propValue;
          }
        }
      }
    }

    if (Object.keys(propDefs).length > 0) {
      return propDefs;
    }

    return null;
  }

  /**
   * componentPropertyReferences에서 참조된 props 추출
   *
   * visibility 제어, text 바인딩 등에서 참조되는 props를 자동으로 추출
   */
  private extractPropsFromPropertyReferences(
    existingSourceKeys: Set<string>,
    existingNames: Set<string>,
    node: SceneNode
  ): PropDefinition[] {
    const result: PropDefinition[] = [];
    const processedRefs = new Set<string>();
    const document = node;

    const traverse = (node: any) => {
      if (!node) return;

      const refs = node.componentPropertyReferences;
      if (refs) {
        // visible 참조 → BOOLEAN prop
        if (refs.visible && !processedRefs.has(refs.visible)) {
          if (!existingSourceKeys.has(refs.visible)) {
            const name = this.normalizePropName(refs.visible);

            // name 중복 체크 추가
            if (!existingNames.has(name)) {
              processedRefs.add(refs.visible);
              existingNames.add(name);

              result.push({
                type: "boolean",
                name,
                sourceKey: refs.visible,
                required: false,
                defaultValue: false,
              });
            }
          }
        }

        // characters 참조 → TEXT prop
        if (refs.characters && !processedRefs.has(refs.characters)) {
          if (!existingSourceKeys.has(refs.characters)) {
            const name = this.normalizePropName(refs.characters);

            // name 중복 체크 추가
            if (!existingNames.has(name)) {
              processedRefs.add(refs.characters);
              existingNames.add(name);

              result.push({
                type: "string",
                name,
                sourceKey: refs.characters,
                required: false,
                defaultValue: node.characters || node.name || "",
              });
            }
          }
        }

        // mainComponent 참조 → INSTANCE_SWAP (slot)
        if (refs.mainComponent && !processedRefs.has(refs.mainComponent)) {
          if (!existingSourceKeys.has(refs.mainComponent)) {
            const name = this.normalizePropName(refs.mainComponent);

            // name 중복 체크 추가
            if (!existingNames.has(name)) {
              processedRefs.add(refs.mainComponent);
              existingNames.add(name);

              result.push({
                type: "slot",
                name,
                sourceKey: refs.mainComponent,
                required: false,
                defaultValue: null,
              });
            }
          }
        }
      }

      // INSTANCE 노드의 children은 해당 컴포넌트 내부 구현이므로 순회하지 않음
      // (INSTANCE 자신의 refs는 처리하되, 그 자식들의 refs는 INSTANCE 자체 컴포넌트에서 처리)
      if (node.type === "INSTANCE") return;

      // 자식 노드 재귀 순회
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(document);
    return result;
  }

  /**
   * componentPropertyReferences에서만 props 추출 (definitions가 없는 경우)
   */
  private extractFromReferencesOnly(node: SceneNode): PropDefinition[] {
    return this.extractPropsFromPropertyReferences(new Set(), new Set(), node);
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
    // eslint-disable-next-line no-control-regex
    const sanitized = sourceKey.replace(/[\x00-\x1F\x7F]/g, "");

    // 1. # 이후 노드 ID 제거
    const cleanKey = sanitized.split("#")[0].trim();

    // 2. 비 ASCII/특수문자를 공백으로 변환 (emoji, box-drawing chars ┗, dots, slashes 등)
    //    유효한 JS 식별자 문자(a-zA-Z0-9)와 공백만 남김
    const asciiClean = cleanKey.replace(/[^a-zA-Z0-9\s]/g, " ").trim();

    // 3. 첫 단어는 소문자, 나머지는 각 단어 첫 글자 대문자 (camelCase)
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

    // 빈 문자열이면 fallback
    if (!propName) {
      propName = "prop";
    }

    // 숫자로 시작하면 _ 접두사 추가 (유효한 JS 식별자)
    if (/^[0-9]/.test(propName)) {
      propName = "_" + propName;
    }

    // 3. Native HTML prop과 충돌하는 이름은 custom 접두사 추가
    if (this.isNativePropConflict(propName)) {
      propName =
        "custom" + propName.charAt(0).toUpperCase() + propName.slice(1);
    }

    // 4. JavaScript 예약어 충돌 방지
    if (this.isJsReservedWord(propName)) {
      propName = "is" + propName.charAt(0).toUpperCase() + propName.slice(1);
    }

    return propName;
  }

  /**
   * JavaScript 예약어인지 확인
   */
  private isJsReservedWord(propName: string): boolean {
    const reservedWords = new Set([
      "break", "case", "catch", "continue", "debugger", "default", "delete",
      "do", "else", "finally", "for", "function", "if", "in", "instanceof",
      "new", "return", "switch", "this", "throw", "try", "typeof", "var",
      "void", "while", "with", "class", "const", "enum", "export", "extends",
      "import", "super", "implements", "interface", "let", "package", "private",
      "protected", "public", "static", "yield", "await", "async"
    ]);
    return reservedWords.has(propName.toLowerCase());
  }

  /**
   * Native HTML prop과 충돌하는 이름인지 확인
   */
  private isNativePropConflict(propName: string): boolean {
    // button/input 등의 native HTML attributes
    const nativeProps = new Set([
      "type", // button type
      "name", // form element name
      "value", // input value
      "checked", // checkbox checked
      "disabled", // disabled state (보통 State prop으로 처리되어 제외됨)
      "required", // required attribute
      "placeholder", // input placeholder
      "href", // anchor href
      "src", // image src
      "alt", // image alt
    ]);

    return nativeProps.has(propName);
  }
}
