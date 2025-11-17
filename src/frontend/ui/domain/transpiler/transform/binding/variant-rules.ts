import { VariantRule } from "../../types";
import { ComponentSetNodeSpec } from "@backend/managers/SpecManager";

export function buildVariantRules(spec: ComponentSetNodeSpec): VariantRule[] {
  const rules: VariantRule[] = [];

  for (const [variantPropName, variantMap] of Object.entries(
    spec.variantPatterns ?? {},
  )) {
    // variantMap: { Large: {...}, Medium: {...}, Small: {...} } 이런 형태
    for (const [variantValue, pattern] of Object.entries(
      variantMap as Record<string, any>,
    )) {
      rules.push({
        variantPropName,
        variantValue,
        diff: pattern, // width/height/fills 등 스타일 변화 전체를 diff로 둠
      });
    }
  }

  return rules;
}
