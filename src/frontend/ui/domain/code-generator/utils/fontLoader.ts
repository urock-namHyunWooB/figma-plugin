/**
 * 동적 폰트 로더
 * Figma 데이터에서 사용된 폰트를 추출하고 웹폰트로 로드
 */

import { FigmaNodeData } from "../types/baseType";

/**
 * Figma 폰트명 → Google Fonts URL 매핑
 * SF Pro는 Apple 전용이므로 시스템 폰트 폴백 사용
 */
const GOOGLE_FONTS_MAP: Record<string, string> = {
  // Google Fonts
  Inter: "Inter:wght@100;200;300;400;500;600;700;800;900",
  Roboto: "Roboto:wght@100;300;400;500;700;900",
  "Open Sans": "Open+Sans:wght@300;400;500;600;700;800",
  Lato: "Lato:wght@100;300;400;700;900",
  Montserrat: "Montserrat:wght@100;200;300;400;500;600;700;800;900",
  Poppins: "Poppins:wght@100;200;300;400;500;600;700;800;900",
  "Source Sans Pro": "Source+Sans+Pro:wght@200;300;400;600;700;900",
  "Noto Sans": "Noto+Sans:wght@100;200;300;400;500;600;700;800;900",
  "Noto Sans KR": "Noto+Sans+KR:wght@100;300;400;500;700;900",
  "Nanum Gothic": "Nanum+Gothic:wght@400;700;800",
  "Nanum Myeongjo": "Nanum+Myeongjo:wght@400;700;800",
  Pretendard: "", // 별도 CDN 필요
};

/**
 * SF Pro 계열 폰트 → 시스템 폰트 폴백 CSS
 */
const SF_PRO_FALLBACK = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/**
 * 이미 로드된 폰트 추적
 */
const loadedFonts = new Set<string>();

/**
 * Figma 노드 데이터에서 사용된 모든 폰트 패밀리 추출
 * @param nodeData - Figma 노드 데이터
 * @returns 추출된 폰트 패밀리 이름 배열
 */
export function extractFontsFromNodeData(nodeData: FigmaNodeData): string[] {
  const fonts = new Set<string>();

  /**
   * 노드를 재귀적으로 순회하며 폰트 추출
   * @param node - 순회할 노드
   */
  function traverse(node: any) {
    // TEXT 노드의 style.fontFamily
    if (node.style?.fontFamily) {
      fonts.add(node.style.fontFamily);
    }

    // styleOverrideTable의 폰트
    if (node.styleOverrideTable) {
      Object.values(node.styleOverrideTable).forEach((override: any) => {
        if (override?.fontFamily) {
          fonts.add(override.fontFamily);
        }
      });
    }

    // 자식 노드 순회
    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  // 메인 문서 순회
  if (nodeData.info?.document) {
    traverse(nodeData.info.document);
  }

  // dependencies 순회
  if (nodeData.dependencies) {
    Object.values(nodeData.dependencies).forEach((dep: any) => {
      if (dep.info?.document) {
        traverse(dep.info.document);
      }
    });
  }

  return Array.from(fonts);
}

/**
 * SF Pro 계열 폰트인지 확인
 * @param fontFamily - 확인할 폰트 패밀리 이름
 * @returns SF Pro 계열이면 true
 */
function isSFProFont(fontFamily: string): boolean {
  const sfProPatterns = [
    "SF Pro",
    "SF Pro Text",
    "SF Pro Display",
    "SF Pro Rounded",
    "SFPro",
  ];
  return sfProPatterns.some(
    (pattern) =>
      fontFamily.includes(pattern) ||
      fontFamily.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Google Fonts URL 생성
 * @param fontFamilies - 폰트 패밀리 이름 배열
 * @returns Google Fonts CSS URL 또는 null
 */
function buildGoogleFontsUrl(fontFamilies: string[]): string | null {
  const googleFontParams = fontFamilies
    .map((font) => GOOGLE_FONTS_MAP[font])
    .filter((param) => param && param.length > 0);

  if (googleFontParams.length === 0) return null;

  return `https://fonts.googleapis.com/css2?${googleFontParams
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;
}

/**
 * Pretendard 폰트 로드 (한국어 폰트)
 * @returns 로드 완료 Promise
 */
async function loadPretendard(): Promise<void> {
  if (loadedFonts.has("Pretendard")) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css";
  document.head.appendChild(link);

  await new Promise<void>((resolve) => {
    link.onload = () => resolve();
    link.onerror = () => resolve(); // 실패해도 계속 진행
  });

  loadedFonts.add("Pretendard");
}

/**
 * SF Pro 시스템 폰트 폴백 CSS 주입
 */
function injectSFProFallback(): void {
  if (loadedFonts.has("SF Pro Fallback")) return;

  const style = document.createElement("style");
  style.textContent = `
    /* SF Pro 시스템 폰트 폴백 */
    @font-face {
      font-family: "SF Pro Text";
      src: local("-apple-system"), local("BlinkMacSystemFont"), local("Helvetica Neue");
      font-weight: 100 900;
      font-style: normal;
    }
    @font-face {
      font-family: "SF Pro Display";
      src: local("-apple-system"), local("BlinkMacSystemFont"), local("Helvetica Neue");
      font-weight: 100 900;
      font-style: normal;
    }
  `;
  document.head.appendChild(style);

  loadedFonts.add("SF Pro Fallback");
}

/**
 * Google Fonts 로드
 * @param fonts - 로드할 폰트 패밀리 이름 배열
 * @returns 로드 완료 Promise
 */
async function loadGoogleFonts(fonts: string[]): Promise<void> {
  const unloadedFonts = fonts.filter(
    (f) => !loadedFonts.has(f) && GOOGLE_FONTS_MAP[f]
  );

  if (unloadedFonts.length === 0) return;

  const url = buildGoogleFontsUrl(unloadedFonts);
  if (!url) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);

  await new Promise<void>((resolve) => {
    link.onload = () => resolve();
    link.onerror = () => resolve();
  });

  // 폰트 로드 완료 대기 (브라우저가 실제로 폰트를 적용할 때까지)
  await document.fonts.ready;

  unloadedFonts.forEach((f) => loadedFonts.add(f));
}

/**
 * 폰트 목록을 받아 필요한 웹폰트 로드
 * @param fonts - 폰트 패밀리 이름 배열
 * @returns 로드된 폰트 정보 (loaded: 성공, fallback: 폴백 사용, notFound: 찾을 수 없음)
 */
export async function loadFonts(fonts: string[]): Promise<{
  loaded: string[];
  fallback: string[];
  notFound: string[];
}> {
  const result = {
    loaded: [] as string[],
    fallback: [] as string[],
    notFound: [] as string[],
  };

  const googleFonts: string[] = [];

  for (const font of fonts) {
    if (loadedFonts.has(font)) {
      result.loaded.push(font);
      continue;
    }

    // SF Pro 계열 → 시스템 폰트 폴백
    if (isSFProFont(font)) {
      injectSFProFallback();
      result.fallback.push(font);

      continue;
    }

    // Pretendard
    if (font === "Pretendard") {
      await loadPretendard();
      result.loaded.push(font);

      continue;
    }

    // Google Fonts 매핑 확인
    if (GOOGLE_FONTS_MAP[font]) {
      googleFonts.push(font);
    } else {
      result.notFound.push(font);
    }
  }

  // Google Fonts 일괄 로드
  if (googleFonts.length > 0) {
    await loadGoogleFonts(googleFonts);
    result.loaded.push(...googleFonts);
  }

  return result;
}

/**
 * Figma 노드 데이터에서 폰트 추출 후 로드 (편의 함수)
 * @param nodeData - Figma 노드 데이터
 * @returns 폰트 정보 (fonts: 추출된 폰트, loaded: 성공, fallback: 폴백 사용, notFound: 찾을 수 없음)
 */
export async function loadFontsFromNodeData(nodeData: FigmaNodeData): Promise<{
  fonts: string[];
  loaded: string[];
  fallback: string[];
  notFound: string[];
}> {
  const fonts = extractFontsFromNodeData(nodeData);
  const loadResult = await loadFonts(fonts);

  return {
    fonts,
    ...loadResult,
  };
}

/**
 * 로드된 폰트 목록 조회
 * @returns 현재까지 로드된 폰트 패밀리 이름 배열
 */
export function getLoadedFonts(): string[] {
  return Array.from(loadedFonts);
}

/**
 * 폰트 로드 상태 초기화 (테스트용)
 */
export function resetFontLoader(): void {
  loadedFonts.clear();
}
