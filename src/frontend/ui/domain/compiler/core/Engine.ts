import FigmaCompiler, { RenderTree } from "@compiler";
import ComponentSetCompiler from "@compiler/core/componentSetNode/ComponentSetCompiler";
import NodeMatcher from "@compiler/core/NodeMatcher";

class Engine {
  private componentSetCompiler?: ComponentSetCompiler;

  constructor(root: FigmaCompiler, renderTree: RenderTree) {
    const node = root.SpecDataManager.getSpecById(renderTree.id);
    const specManager = root.SpecDataManager;

    if (node.type === "COMPONENT_SET") {
      this.componentSetCompiler = new ComponentSetCompiler(
        renderTree,
        specManager,
        new NodeMatcher(specManager)
      );
    }
  }

  /**
   * 생성된 React 컴포넌트 코드를 반환
   * @param componentName 컴포넌트 이름 (기본값: "Button")
   * @returns 생성된 TypeScript/TSX 코드 문자열, 또는 null (COMPONENT_SET이 아닌 경우)
   */
  public getGeneratedCode(componentName: string = "Button"): string | null {
    return this.componentSetCompiler?.getGeneratedCode(componentName) || null;
  }
}

export default Engine;
