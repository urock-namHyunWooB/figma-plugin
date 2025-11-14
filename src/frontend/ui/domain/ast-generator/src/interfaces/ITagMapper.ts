/**
 * Figma 노드 타입을 HTML 태그로 매핑하는 인터페이스
 */
export interface ITagMapper {
  /**
   * Figma 노드 타입을 HTML 태그로 변환
   */
  mapFigmaTypeToTag(type: string): string;
}

