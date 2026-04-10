import type { RadixComponentConfig } from "./RadixComponentConfig";
import { registerRadixConfig } from "./RadixComponentConfig";

const switchConfig: RadixComponentConfig = {
  packageName: "@radix-ui/react-switch",
  importAlias: "SwitchPrimitives",
  rootPrimitive: "SwitchPrimitives.Root",
  subPrimitives: [
    {
      role: "thumb",
      primitive: "SwitchPrimitives.Thumb",
      identify: (node) => {
        if (!node.styles?.base) return false;
        const base = node.styles.base;
        return "borderRadius" in base || "border-radius" in base;
      },
      childContent: "none",
    },
  ],
  nativeRadixProps: new Set([
    "checked", "onCheckedChange", "active", "disabled", "disable",
  ]),
  nativeRadixAttrs: new Set([
    "role", "aria-checked", "onClick", "disabled",
  ]),
};

registerRadixConfig("toggle", switchConfig);
