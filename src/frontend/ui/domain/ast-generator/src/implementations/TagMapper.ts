import type { ITagMapper } from "../interfaces/ITagMapper";

/**
 * Figma 노드 타입을 HTML 태그로 매핑하는 기본 구현체
 */
export class TagMapper implements ITagMapper {
  public mapFigmaTypeToTag(type: string): string {
    switch (type) {
      case "TEXT":
        return "span";
      case "RECTANGLE":
      case "FRAME":
      case "COMPONENT":
      case "INSTANCE":
        return "div";
      case "LINE":
        return "hr";
      default:
        return "div";
    }
  }
}

