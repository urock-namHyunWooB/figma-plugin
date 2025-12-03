import Engine from "./core/Engine";
import { FigmaNodeData } from "./type";

export class FigmaCompiler {
  private Engine: Engine;

  constructor(spec: FigmaNodeData) {
    this.Engine = new Engine(spec);
  }
}

export default FigmaCompiler;
