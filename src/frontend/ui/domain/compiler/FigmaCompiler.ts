import Engine from "./core/Engine";
import SpecDataManager from "./manager/SpecDataManager";
import { FigmaNodeData } from "./types/baseType";

export class FigmaCompiler {
  public readonly SpecDataManager: SpecDataManager;
  private Engine: Engine;

  constructor(spec: FigmaNodeData) {
    const specDataManager = (this.SpecDataManager = new SpecDataManager(spec));
    this.Engine = new Engine(this, specDataManager.getRenderTree());
  }
}

export default FigmaCompiler;
