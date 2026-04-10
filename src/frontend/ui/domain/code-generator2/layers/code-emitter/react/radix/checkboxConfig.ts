import type { RadixComponentConfig } from "./RadixComponentConfig";
import { registerRadixConfig } from "./RadixComponentConfig";

const checkboxConfig: RadixComponentConfig = {
  packageName: "@radix-ui/react-checkbox",
  importAlias: "CheckboxPrimitive",
  rootPrimitive: "CheckboxPrimitive.Root",
  subPrimitives: [
    {
      role: "indicator",
      primitive: "CheckboxPrimitive.Indicator",
      identify: (node) => !!node.visibleCondition,
      childContent: "vector-child",
    },
  ],
  nativeRadixProps: new Set([
    "checked", "onCheckedChange", "disabled", "disable",
  ]),
  nativeRadixAttrs: new Set([
    "role", "aria-checked", "onClick", "disabled",
  ]),
};

registerRadixConfig("checkbox", checkboxConfig);
