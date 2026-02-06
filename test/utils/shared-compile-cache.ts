import FigmaCodeGenerator from "@code-generator";

interface CachedCompileResult {
  emotion: string | null;
  tailwind: string | null;
}

type FixtureEntry = { name: string; data: any };

// 캐시 저장소
const cache = new Map<string, CachedCompileResult>();

/**
 * fixture를 Emotion/Tailwind 둘 다 컴파일하여 캐시에 저장
 */
async function compileAndCache(
  name: string,
  data: any
): Promise<CachedCompileResult> {
  // Emotion 컴파일
  const emotionCompiler = new FigmaCodeGenerator(data);
  const emotion = await emotionCompiler.compile();

  // Tailwind 컴파일
  const tailwindCompiler = new FigmaCodeGenerator(data, {
    styleStrategy: { type: "tailwind" },
  });
  const tailwind = await tailwindCompiler.compile();

  const result = { emotion, tailwind };
  cache.set(name, result);
  return result;
}

/**
 * 테스트 시작 전 fixture 배열을 미리 컴파일하여 캐시 워밍업
 */
export async function warmupCache(fixtures: FixtureEntry[]): Promise<void> {
  await Promise.all(
    fixtures.map(({ name, data }) => compileAndCache(name, data))
  );
}

/**
 * 캐시된 컴파일 결과 반환 (없으면 컴파일 후 캐시)
 */
export async function getCachedCompile(
  name: string,
  data: any
): Promise<CachedCompileResult> {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }
  return compileAndCache(name, data);
}
