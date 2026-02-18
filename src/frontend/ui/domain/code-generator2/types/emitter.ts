/**
 * Import 문 정의
 */
export interface ImportStatement {
  module: string;
  defaultImport?: string;
  namedImports?: string[];
  isTypeOnly?: boolean;
}

/**
 * CodeEmitter 출력
 */
export interface EmittedCode {
  /** 컴포넌트 코드 */
  code: string;
  /** Import 문들 */
  imports: ImportStatement[];
  /** TypeScript 타입 정의 */
  types: string;
  /** 컴포넌트 이름 */
  componentName: string;
}

/**
 * CodeEmitter 인터페이스
 * UITree를 플랫폼별 코드로 변환
 */
export interface ICodeEmitter {
  emit(tree: import("./types").UITree): Promise<EmittedCode>;
}
