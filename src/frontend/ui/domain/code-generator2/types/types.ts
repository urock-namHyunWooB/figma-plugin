/**
 * 스타일 트리
 * 노드의 CSS 스타일 정보를 계층적으로 표현
 */
export interface StyleTree {
  id: string;
  name: string;
  cssStyle: Record<string, string>;
  children: StyleTree[];
}

/**
 * Figma REST API 응답 구조
 */
export interface FigmaRestApiResponse {
  document: SceneNode;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
  styles: Record<string, { key: string; name: string; styleType: string }>;
  schemaVersion: number;
}

/**
 * Figma 노드 데이터
 * 플러그인에서 추출한 전체 정보
 */
export interface FigmaNodeData {
  pluginData: { key: string; value: string }[];
  info: FigmaRestApiResponse;
  styleTree: StyleTree;
  dependencies?: Record<string, FigmaNodeData>;
  imageUrls?: Record<string, string>;
  vectorSvgs?: Record<string, string>;
}
