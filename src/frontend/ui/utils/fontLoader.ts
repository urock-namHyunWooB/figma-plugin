/**
 * 동적 폰트 로더
 * Figma 데이터에서 사용된 폰트를 추출하고 웹폰트로 로드
 */

import type { FigmaNodeData } from "@code-generator2";

const GOOGLE_FONTS_MAP: Record<string, string> = {
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
  Pretendard: "",
};

const loadedFonts = new Set<string>();

export function extractFontsFromNodeData(nodeData: FigmaNodeData): string[] {
  const fonts = new Set<string>();

  function traverse(node: any) {
    if (node.style?.fontFamily) {
      fonts.add(node.style.fontFamily);
    }
    if (node.styleOverrideTable) {
      Object.values(node.styleOverrideTable).forEach((override: any) => {
        if (override?.fontFamily) {
          fonts.add(override.fontFamily);
        }
      });
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  if (nodeData.info?.document) {
    traverse(nodeData.info.document);
  }
  if (nodeData.dependencies) {
    Object.values(nodeData.dependencies).forEach((dep: any) => {
      if (dep.info?.document) {
        traverse(dep.info.document);
      }
    });
  }

  return Array.from(fonts);
}

function isSFProFont(fontFamily: string): boolean {
  const sfProPatterns = [
    "SF Pro", "SF Pro Text", "SF Pro Display", "SF Pro Rounded", "SFPro",
  ];
  return sfProPatterns.some(
    (pattern) =>
      fontFamily.includes(pattern) ||
      fontFamily.toLowerCase().includes(pattern.toLowerCase())
  );
}

function buildGoogleFontsUrl(fontFamilies: string[]): string | null {
  const googleFontParams = fontFamilies
    .map((font) => GOOGLE_FONTS_MAP[font])
    .filter((param) => param && param.length > 0);

  if (googleFontParams.length === 0) return null;

  return `https://fonts.googleapis.com/css2?${googleFontParams
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;
}

async function loadPretendard(): Promise<void> {
  if (loadedFonts.has("Pretendard")) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css";
  document.head.appendChild(link);

  await new Promise<void>((resolve) => {
    link.onload = () => resolve();
    link.onerror = () => resolve();
  });

  loadedFonts.add("Pretendard");
}

function injectSFProFallback(): void {
  if (loadedFonts.has("SF Pro Fallback")) return;

  const style = document.createElement("style");
  style.textContent = `
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

  await document.fonts.ready;

  unloadedFonts.forEach((f) => loadedFonts.add(f));
}

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

    if (isSFProFont(font)) {
      injectSFProFallback();
      result.fallback.push(font);
      continue;
    }

    if (font === "Pretendard") {
      await loadPretendard();
      result.loaded.push(font);
      continue;
    }

    if (GOOGLE_FONTS_MAP[font]) {
      googleFonts.push(font);
    } else {
      result.notFound.push(font);
    }
  }

  if (googleFonts.length > 0) {
    await loadGoogleFonts(googleFonts);
    result.loaded.push(...googleFonts);
  }

  return result;
}

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

export function getLoadedFonts(): string[] {
  return Array.from(loadedFonts);
}

export function resetFontLoader(): void {
  loadedFonts.clear();
}
