import Engine from "./core/Engine";
import SpecDataManager from "./manager/SpecDataManager";
import { FigmaNodeData } from "./types/baseType";

export interface PropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  originalType?: string;
}

export class FigmaCompiler {
  public readonly SpecDataManager: SpecDataManager;
  public readonly Engine: Engine;

  constructor(spec: FigmaNodeData) {
    const specDataManager = (this.SpecDataManager = new SpecDataManager(spec));
    this.Engine = new Engine(this, specDataManager.getRenderTree());
  }

  /**
   * 생성된 React 컴포넌트 코드를 반환
   * @param componentName 컴포넌트 이름 (기본값: "Button")
   * @returns 생성된 TypeScript/TSX 코드 문자열, 또는 null (COMPONENT_SET이 아닌 경우)
   */
  public async getGeneratedCode(
    componentName: string = "Button"
  ): Promise<string | null> {
    return await this.Engine.getGeneratedCode(componentName);
  }

  /**
   * Props 정의 반환 (UI 컨트롤러 생성용)
   */
  public getPropsDefinition(): PropDefinition[] {
    const astTree = this.Engine.getFinalAstTree();
    const props = astTree.props;

    return Object.entries(props).map(([name, def]: [string, any]) => ({
      name,
      type: def.type,
      defaultValue: def.defaultValue,
      variantOptions: def.variantOptions,
      originalType: def.originalType,
    }));
  }

  /**
   * 컴포넌트 이름 반환
   */
  public getComponentName(): string {
    const document = this.SpecDataManager.getDocument();
    // 공백을 제거하고 PascalCase로 변환
    return document.name.replace(/\s+/g, "");
  }
}

export default FigmaCompiler;
