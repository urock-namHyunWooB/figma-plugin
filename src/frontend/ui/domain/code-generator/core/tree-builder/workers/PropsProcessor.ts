/**
 * Props Processor
 *
 * Props 추출 및 바인딩을 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - PropsExtractor: componentPropertyDefinitions에서 props 추출
 * - PropsLinker: componentPropertyReferences를 propBindings으로 변환
 */

import type { PropDefinition } from "@code-generator/types/architecture";
import type {
  IPropsExtractor,
  IPropsLinker,
  PropBinding,
  BuildContext,
} from "./interfaces";
import { traverseTree } from "./utils/treeUtils";
import { toCamelCase } from "./utils/stringUtils";

// ============================================================================
// Types
// ============================================================================

/**
 * Figma prop 타입 → 내부 타입 매핑 테이블
 */
const FIGMA_PROP_TYPE_MAP: Record<string, PropDefinition["type"]> = {
  VARIANT: "variant",
  BOOLEAN: "boolean",
  TEXT: "string",
  INSTANCE_SWAP: "slot",
};

/**
 * 네이티브 HTML 속성과 충돌하는 prop 이름 목록
 * 이 prop 이름들은 custom prefix가 추가됨
 */
const CONFLICTING_HTML_ATTRS = new Set([
  "disabled",
  "type",
  "value",
  "name",
  "id",
  "hidden",
  "checked",
  "selected",
  "required",
  "readonly",
  "placeholder",
  "autofocus",
  "autocomplete",
]);

// ============================================================================
// PropsProcessor Class
// ============================================================================

/**
 * Props 처리 통합 클래스
 *
 * Props 추출(Extractor)과 바인딩(Linker) 기능을 통합
 */
export class PropsProcessor implements IPropsExtractor, IPropsLinker {
  static extract(ctx: BuildContext): BuildContext {
    const instance = new PropsProcessor();
    const propsMap = instance.extractProps(ctx.data.props);
    return { ...ctx, propsMap };
  }

  static bindProps(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.propsMap) {
      throw new Error(
        "PropsProcessor.bindProps: internalTree and propsMap are required."
      );
    }

    const instance = new PropsProcessor();
    const nodePropBindings = new Map<string, Record<string, string>>();

    traverseTree(ctx.internalTree, (node) => {
      const nodeSpec = ctx.data.getNodeById(node.id);
      if (nodeSpec?.componentPropertyReferences) {
        const bindings = instance.linkProps(
          nodeSpec.componentPropertyReferences,
          ctx.propsMap!
        );
        if (Object.keys(bindings).length > 0) {
          nodePropBindings.set(node.id, bindings);
        }
      }
    });

    return { ...ctx, nodePropBindings };
  }

  // ==========================================================================
  // Extractor Methods
  // ==========================================================================

  /**
   * componentPropertyDefinitions에서 props 추출
   *
   * @param props - Figma의 componentPropertyDefinitions
   * @returns PropDefinition Map
   */
  public extractProps(props: unknown): Map<string, PropDefinition> {
    const map = new Map<string, PropDefinition>();

    if (!props || typeof props !== "object") {
      return map;
    }

    for (const [originalName, def] of Object.entries(props)) {
      if (!def || typeof def !== "object") {
        continue;
      }

      // 유효한 JavaScript 식별자로 변환 (숫자로 시작하는 이름 처리)
      let name = toCamelCase(originalName);

      // 네이티브 HTML 속성과 충돌하는 prop 이름 rename
      name = this.renameConflictingPropName(name);

      const d = def as { type?: string; defaultValue?: unknown; variantOptions?: string[] };
      const propType = this.mapPropType(d.type);
      const options = d.variantOptions;

      // Check if this is a boolean-like VARIANT (True/False options)
      // These get converted to boolean type here.
      // If they actually control INSTANCE visibility, SlotProcessor will upgrade them to slot later.
      const isBooleanLikeVariant = propType === "variant" &&
        options &&
        options.length === 2 &&
        options.some((o) => o === "True" || o === "true") &&
        options.some((o) => o === "False" || o === "false");

      // originalKey 저장: Figma 원본 키 (componentPropertyReferences와 매칭용)
      // DataPreparer가 이미 설정한 originalKey를 우선 사용
      const existingOriginalKey = (def as { originalKey?: string }).originalKey;

      // Determine final prop type:
      // - Boolean-like VARIANTs (True/False) → boolean type
      // - Other VARIANTs → variant type
      // SlotProcessor will later upgrade boolean to slot if it controls INSTANCE visibility
      const finalType = isBooleanLikeVariant ? "boolean" : propType;

      // Convert default value to boolean if it's a boolean-like VARIANT
      let finalDefaultValue = d.defaultValue;
      if (isBooleanLikeVariant && typeof d.defaultValue === "string") {
        finalDefaultValue = d.defaultValue.toLowerCase() === "true";
      }

      map.set(originalName, {
        name,
        type: finalType,
        defaultValue: finalDefaultValue,
        required: false,
        options,
        originalKey: existingOriginalKey || (originalName !== name ? originalName : undefined),
      } as PropDefinition);
    }

    return map;
  }

  /**
   * Figma prop 타입을 내부 타입으로 매핑
   *
   * @param type - Figma의 prop 타입 (VARIANT, BOOLEAN, TEXT, INSTANCE_SWAP)
   * @returns 내부 타입
   */
  public mapPropType(type?: string): PropDefinition["type"] {
    return FIGMA_PROP_TYPE_MAP[type ?? ""] ?? "string";
  }

  // ==========================================================================
  // Linker Methods
  // ==========================================================================

  /**
   * componentPropertyReferences를 propBindings으로 변환
   *
   * @param refs - Figma 노드의 componentPropertyReferences
   * @param propsDefinitions - 추출된 props 정의
   * @returns propBindings 맵 (속성명 → prop 이름)
   */
  public linkProps(
    refs: Record<string, string> | undefined,
    propsDefinitions: Map<string, PropDefinition>
  ): Record<string, string> {
    if (!refs) return {};

    const bindings: Record<string, string> = {};

    // characters → text prop binding
    if (refs.characters) {
      const propName = this.findPropNameByOriginalKey(
        propsDefinitions,
        refs.characters
      );
      if (propName) {
        bindings.characters = propName;
      }
    }

    // visible → boolean prop binding
    if (refs.visible) {
      const propName = this.findPropNameByOriginalKey(
        propsDefinitions,
        refs.visible
      );
      if (propName) {
        bindings.visible = propName;
      }
    }

    // mainComponent → slot prop binding (INSTANCE_SWAP)
    if (refs.mainComponent) {
      const propName = this.findPropNameByOriginalKey(
        propsDefinitions,
        refs.mainComponent
      );
      if (propName) {
        bindings.mainComponent = propName;
      }
    }

    return bindings;
  }

  /**
   * prop 바인딩 정보 추출 (상세 정보 포함)
   */
  public extractPropBindings(
    refs: Record<string, string> | undefined
  ): PropBinding[] {
    if (!refs) return [];

    const bindings: PropBinding[] = [];

    if (refs.characters) {
      bindings.push({
        bindingType: "text",
        originalRef: refs.characters,
      });
    }

    if (refs.visible) {
      bindings.push({
        bindingType: "visible",
        originalRef: refs.visible,
      });
    }

    if (refs.mainComponent) {
      bindings.push({
        bindingType: "component",
        originalRef: refs.mainComponent,
      });
    }

    return bindings;
  }

  /**
   * 노드에 prop 바인딩이 있는지 확인
   */
  public hasAnyBinding(refs: Record<string, string> | undefined): boolean {
    if (!refs) return false;
    return Boolean(refs.characters || refs.visible || refs.mainComponent);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * 원본 키로 prop 이름 찾기
   */
  private findPropNameByOriginalKey(
    propsDefinitions: Map<string, PropDefinition>,
    originalKey: string
  ): string | undefined {
    for (const [name, def] of propsDefinitions.entries()) {
      if (def.originalKey === originalKey) {
        return name;
      }
    }
    return undefined;
  }

  /**
   * 네이티브 HTML 속성과 충돌하는 prop 이름 rename
   * type → customType, disabled → customDisabled 등
   */
  private renameConflictingPropName(propName: string): string {
    if (CONFLICTING_HTML_ATTRS.has(propName.toLowerCase())) {
      return `custom${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
    }
    return propName;
  }
}

export default PropsProcessor;
