import Engine from "./core/Engine";
import SpecDataManager from "./manager/SpecDataManager";
import { FigmaNodeData } from "./types/baseType";

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
}

export default FigmaCompiler;
