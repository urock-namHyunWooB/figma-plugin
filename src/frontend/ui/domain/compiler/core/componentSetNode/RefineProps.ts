import { RenderTree } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";

import { toCamelCase } from "@compiler/utils/normalizeString";

type PropsDef = Record<string, any>;

class RefineProps {
  private specDataManager: SpecDataManager;
  private renderTree: RenderTree;

  private propsDef: PropsDef | null;

  public get refinedProps() {
    return this.propsDef;
  }

  constructor(renderTree: RenderTree, specDataManager: SpecDataManager) {
    this.specDataManager = specDataManager;
    this.renderTree = renderTree;

    const propsDef = (this.propsDef =
      specDataManager.getComponentPropertyDefinitions());

    if (propsDef) {
      this.propsDef = this.addId(propsDef);
      this.propsDef = this.normalizePropsName(this.propsDef);
      this.propsDef = this.refineLikeComponent(this.propsDef);
      this.propsDef = this.refineStateProp(this.propsDef);
    }
  }

  private addId(propsDef: PropsDef) {
    const props = {} as PropsDef;

    return propsDef;
  }

  private normalizePropsName(
    componentPropertyDefinitions: ComponentPropertyDefinitions
  ) {
    const props = {} as PropsDef;

    Object.entries(componentPropertyDefinitions).forEach(([key, value]) => {
      props[toCamelCase(key)] = value;
    });

    return props;
  }

  private refineLikeComponent(propsDef: PropsDef) {
    Object.entries(propsDef).forEach(([key, value]) => {
      if (
        ((value.type === "VARIANT" &&
          value.variantOptions?.[0].toLowerCase() === "false") ||
          value.variantOptions?.[0].toLowerCase() === "true") &&
        (value.variantOptions?.[1].toLowerCase() === "false" ||
          value.variantOptions?.[1].toLowerCase() === "true")
      ) {
        value.type = "Component";
        delete value.defaultValue;
        delete value.variantOptions;
      }
    });

    return propsDef;
  }

  private refineStateProp(propsDef: PropsDef) {
    Object.entries(propsDef).forEach(([key, value]) => {
      if (
        key.toLowerCase().includes("state") &&
        value.type === "VARIANT" &&
        (value.variantOptions.includes("Hover") ||
          value.variantOptions.includes("hover") ||
          value.variantOptions.includes("HOVER"))
      ) {
        delete propsDef[key];
      }
    });

    return propsDef;
  }
}

export default RefineProps;
