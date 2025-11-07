import { FigmaPlugin } from "../FigmaPlugin";

class SpecManager {
  private figmaPlugin: FigmaPlugin;
  private metadataManager: FigmaPlugin["metadataManager"];
  private componentStructureManager: FigmaPlugin["componentStructureManager"];

  constructor(
    figmaPlugin: FigmaPlugin,
    metadataManager: FigmaPlugin["metadataManager"],
    componentStructureManager: FigmaPlugin["componentStructureManager"]
  ) {
    this.figmaPlugin = figmaPlugin;
    this.metadataManager = metadataManager;
    this.componentStructureManager = componentStructureManager;
  }

  /**
   * 컴포넌트 이름으로부터 적절한 root element 추론
   */
  private inferRootElement(componentName: string): string {
    const lowerName = componentName.toLowerCase();

    // HTML 태그 매핑
    if (lowerName.includes("button")) return "button";
    if (lowerName.includes("input")) return "input";
    if (lowerName.includes("form")) return "form";
    if (lowerName.includes("header")) return "header";
    if (lowerName.includes("footer")) return "footer";
    if (lowerName.includes("nav")) return "nav";
    if (lowerName.includes("section")) return "section";
    if (lowerName.includes("article")) return "article";
    if (lowerName.includes("aside")) return "aside";
    if (lowerName.includes("main")) return "main";

    // 기본값
    return "div";
  }

  public getComponentSpec() {
    const selection = figma.currentPage.selection;

    const componentSet = selection[0] as ComponentSetNode;
    const componentSetInfo = componentSet.componentPropertyDefinitions;

    const propsDefinition =
      this.metadataManager.getCombinedPropsDefinition(componentSet);
    const internalStateDefinition =
      this.metadataManager.getInternalStateDefinition(componentSet);
    const componentStructure =
      this.componentStructureManager.extractStructure(componentSet);
    const elementBindings =
      this.metadataManager.getElementBindings(componentSet);
    const variantStyles =
      this.componentStructureManager.extractVariantStyles(componentSet);

    // Root Element: 저장된 값 또는 자동 추론
    const savedRootElement = this.metadataManager.getRootElement(componentSet);
    const rootElement =
      savedRootElement || this.inferRootElement(componentSet.name);

    // metadata 객체로 묶기
    const metadata = {
      name: componentSet.name,
      rootElement: rootElement,
    };

    const spec = {
      metadata,
      componentSetInfo,
      propsDefinition,
      internalStateDefinition,
      componentStructure,
      elementBindings,
      variantStyles,
    };

    return spec;
  }
}

export default SpecManager;
