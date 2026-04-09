/**
 * TextProcessor
 *
 * TEXT 노드 전용 처리
 * - characterStyleOverrides → textSegments 변환
 * - 문자별 스타일 추출
 */

import type DataManager from "../../../data-manager/DataManager";

export class TextProcessor {
  constructor(private readonly dataManager: DataManager) {}

  /**
   * TEXT 노드의 textSegments 생성
   *
   * @param nodeId - TEXT 노드 ID
   * @returns textSegments 배열 또는 undefined
   */
  public processTextNode(
    nodeId: string
  ): Array<{ text: string; style?: Record<string, string> }> | undefined {
    const { node } = this.dataManager.getById(nodeId);

    if (!node || !("characters" in node) || typeof node.characters !== "string") {
      return undefined;
    }

    const characters = node.characters;

    // characterStyleOverrides가 없으면 전체 텍스트를 하나의 segment로
    const nodeAny = node as any;
    if (
      !nodeAny.characterStyleOverrides ||
      nodeAny.characterStyleOverrides.length === 0
    ) {
      return [{ text: characters }];
    }

    return this.parseTextSegments(node as any);
  }

  /**
   * characterStyleOverrides 파싱
   *
   * characterStyleOverrides: [0, 0, 0, 9, 9, 9]
   * → segments: [{text: "안심", style: baseStyle}, {text: "삭제", style: override9}]
   */
  private parseTextSegments(
    node: any
  ): Array<{ text: string; style?: Record<string, string> }> {
    const characters = node.characters || "";
    const overrides = node.characterStyleOverrides;
    const styleTable = node.styleOverrideTable || {};

    // 연속된 같은 스타일을 하나의 segment로 그룹화
    const segments: Array<{ text: string; style?: Record<string, string> }> = [];
    let currentStyleIndex = overrides[0];
    let currentText = characters[0] || "";

    for (let i = 1; i < characters.length; i++) {
      const styleIndex = overrides[i];

      if (styleIndex === currentStyleIndex) {
        // 같은 스타일이면 텍스트 추가
        currentText += characters[i];
      } else {
        // 스타일이 바뀌면 현재 segment 저장
        const style = this.extractCharacterStyle(currentStyleIndex, styleTable, node);
        segments.push(style ? { text: currentText, style } : { text: currentText });

        // 새 segment 시작
        currentStyleIndex = styleIndex;
        currentText = characters[i];
      }
    }

    // 마지막 segment 저장
    const style = this.extractCharacterStyle(currentStyleIndex, styleTable, node);
    segments.push(style ? { text: currentText, style } : { text: currentText });

    return segments;
  }

  /**
   * 문자 스타일 추출
   *
   * styleIndex === 0 → baseNode에서 기본 스타일
   * styleIndex !== 0 → styleTable[styleIndex]에서 override 스타일
   */
  private extractCharacterStyle(
    styleIndex: number,
    styleTable: any,
    baseNode: any
  ): Record<string, string> | undefined {
    const style: Record<string, string> = {};

    // styleIndex === 0 → 기본 스타일 사용
    if (styleIndex === 0 || !styleTable[styleIndex]) {
      // baseNode.style에서 기본 스타일 추출
      if (baseNode.style) {
        if (baseNode.style.fontWeight !== undefined) {
          style.fontWeight = String(baseNode.style.fontWeight);
        }
        if (baseNode.style.fontSize !== undefined) {
          style.fontSize = `${baseNode.style.fontSize}px`;
        }
        if (baseNode.style.letterSpacing !== undefined) {
          style.letterSpacing = `${baseNode.style.letterSpacing}px`;
        }
      }

      // baseNode.fills에서 색상 추출
      if (baseNode.fills && baseNode.fills.length > 0) {
        const fill = baseNode.fills[0];
        if (fill.type === "SOLID" && fill.color) {
          const { r, g, b, a } = fill.color;
          const toHex = (v: number) =>
            Math.round(v * 255)
              .toString(16)
              .padStart(2, "0");

          if (a !== undefined && a < 1) {
            style.color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
          } else {
            style.color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          }
        }
      }

      return Object.keys(style).length > 0 ? style : undefined;
    }

    // styleIndex !== 0 → override 스타일 사용
    const overrideStyle = styleTable[styleIndex];

    // fontWeight
    if (overrideStyle.fontWeight !== undefined) {
      style.fontWeight = String(overrideStyle.fontWeight);
    }

    // fontSize
    if (overrideStyle.fontSize !== undefined) {
      style.fontSize = `${overrideStyle.fontSize}px`;
    }

    // color (fills에서 추출)
    if (overrideStyle.fills && overrideStyle.fills.length > 0) {
      const fill = overrideStyle.fills[0];
      if (fill.type === "SOLID" && fill.color) {
        const { r, g, b, a } = fill.color;
        const toHex = (v: number) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0");

        if (a !== undefined && a < 1) {
          style.color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
        } else {
          style.color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
      }
    }

    // letterSpacing
    if (overrideStyle.letterSpacing !== undefined) {
      style.letterSpacing = `${overrideStyle.letterSpacing}px`;
    }

    return Object.keys(style).length > 0 ? style : undefined;
  }
}
