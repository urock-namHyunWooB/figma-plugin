/**
 * 테스트 파일 간 공유 컴파일 캐시
 *
 * 단일 스레드 모드(singleThread: true)에서만 효과적으로 작동합니다.
 * 모든 테스트 파일이 동일한 프로세스에서 실행되어 모듈 캐시가 공유됩니다.
 */

import FigmaCompiler from "@compiler";

// 컴파일 결과 타입
export interface CachedCompileResult {
  emotion: string | null;
  tailwind: string | null;
}

// 전역 컴파일 캐시 (모듈 레벨에서 유지됨)
const compileCache = new Map<string, CachedCompileResult>();

/**
 * 특정 fixture의 컴파일 결과를 가져옵니다.
 * 캐시에 없으면 Emotion과 Tailwind 모두 컴파일하여 캐시에 저장합니다.
 */
export async function getCachedCompile(
  name: string,
  data: unknown
): Promise<CachedCompileResult> {
  if (!compileCache.has(name)) {
    const emotionCompiler = new FigmaCompiler(data as any);
    const tailwindCompiler = new FigmaCompiler(data as any, {
      styleStrategy: { type: "tailwind" },
    });

    const [emotion, tailwind] = await Promise.all([
      emotionCompiler.compile(),
      tailwindCompiler.compile(),
    ]);

    compileCache.set(name, { emotion, tailwind });
  }
  return compileCache.get(name)!;
}

/**
 * 여러 fixture를 병렬로 컴파일하고 캐시에 저장합니다.
 */
export async function warmupCache(
  fixtures: Array<{ name: string; data: unknown }>
): Promise<void> {
  await Promise.all(
    fixtures.map(({ name, data }) => getCachedCompile(name, data))
  );
}

/**
 * 캐시 크기를 반환합니다.
 */
export function getCacheSize(): number {
  return compileCache.size;
}
