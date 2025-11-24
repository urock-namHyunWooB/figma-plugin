import { NodeInfoExtractor } from "../extractors/NodeInfoExtractor";
import { MetadataManager } from "./MetadataManager";
import { ComponentStructureManager } from "./ComponentStructureManager";
import { MESSAGE_TYPES } from "../types/messages";
import SpecManager from "@backend/managers/SpecManager";
import specManager from "@backend/managers/SpecManager";
import { ComponentSetNode } from "@figma/plugin-typings/plugin-api-standalone";

/**
 * 선택 관리 클래스
 * 단일 책임: 현재 선택된 노드 관리 및 변경 감지
 */
export class SelectionManager {
  constructor() {}

  /**
   * 현재 선택 정보를 UI로 전송
   */
}
