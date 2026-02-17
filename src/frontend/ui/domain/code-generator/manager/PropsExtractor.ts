/**
 * Props 정의 타입
 *
 * DataPreparer에서 props 추출 시 사용
 * @typedef {Record<string, any>} PropsDef
 */
export type PropsDef = Record<string, any>;

/**
 * Props 추출 클래스
 * @deprecated PropsExtractor 클래스는 더 이상 사용되지 않습니다.
 * DataPreparer.extractProps()를 사용하세요.
 * @class
 */
class PropsExtractor {
  // 레거시: 하위 호환성을 위해 유지
}

export default PropsExtractor;
