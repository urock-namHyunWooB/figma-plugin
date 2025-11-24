import { useLayoutEffect, useRef, useState } from "react";
import { ElementBindingsMap } from "./domain/component-structure/types";
import {
  PropDefinition,
  StateDefinition,
} from "../../backend/managers/MetadataManager";

import { MESSAGE_TYPES } from "../../backend/types/messages";
import {
  ComponentStructureData,
  LayoutTreeNode,
} from "../../backend/managers/ComponentStructureManager";
import { ASTGenerator, type ComponentDSL } from "./utils/ast-generator";

interface LayerData {
  id: string;
  name: string;
  type: string;
  metadataType?: string;
  visible: boolean;
  locked: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  fills?: any[];
  strokes?: any[];
  strokeWeight?: number;
  cornerRadius?: number;
  characters?: string;
  fontSize?: number;
  fontName?: any;
  textAlignHorizontal?: string;
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  childrenCount?: number;
  effects?: any[];
  blendMode?: string;
  isInstance?: boolean;
  mainComponentName?: string;
  componentSetName?: string;
  componentProperties?: any;
  availableVariants?: Record<string, string[]>;
}

interface PropertyConfig {
  name: string;
  type: "BOOLEAN" | "TEXT" | "VARIANT";
  required: boolean;
  is_prop: boolean;
  initValue: string | boolean | null;
  variantOptions?: string[];
}

export default function useMessageHandler() {
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [componentSetInfo, setComponentSetInfo] =
    useState<ComponentPropertyDefinitions | null>(null);
  const [savedPropertyConfig, setSavedPropertyConfig] = useState<
    PropertyConfig[] | null
  >(null);

  const [componentStructure, setComponentStructure] =
    useState<ComponentStructureData | null>(null);

  const [layoutTree, setLayoutTree] = useState<LayoutTreeNode | null>(null);

  const [internalStateDefinition, setInternalStateDefinition] = useState<
    StateDefinition[] | null
  >(null);

  const [propsDefinition, setPropsDefinition] = useState<
    PropDefinition[] | null
  >([]);

  const [elementBindings, setElementBindings] = useState<ElementBindingsMap>(
    {},
  );

  const [extractJson, setExtractJson] = useState<string | null>(null);

  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // AST Generator 인스턴스 (한 번만 생성)
  const astGeneratorRef = useRef<ASTGenerator | null>(null);

  useLayoutEffect(() => {
    // AST Generator 인스턴스 생성 (한 번만)
    if (!astGeneratorRef.current) {
      astGeneratorRef.current = new ASTGenerator();
    }
  }, []);

  useLayoutEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage;

      if (msg.type === "selection-info") {
        setLayers(msg.data);
      }

      if (msg.type === "component-set-info") {
        // ComponentSet이 변경되면 savedPropertyConfig 초기화
        setSavedPropertyConfig(null);
      }

      if (msg.type === "component-property-config") {
        setSavedPropertyConfig(msg.data);
      }

      if (msg.type === "extract-json") {
        setExtractJson(msg.data);
      }

      if (msg.type === MESSAGE_TYPES.COMPONENT_STRUCTURE) {
        setComponentStructure(msg.data?.componentStructure || null);
        setLayoutTree(msg.data?.layoutTree || null);
      }

      if (msg.type === "internal-state-definition") {
        setInternalStateDefinition(msg.data);
      }

      if (msg.type === MESSAGE_TYPES.PROPS_DEFINITION) {
        setPropsDefinition(msg.data);
      }

      if (msg.type === "element-bindings") {
        setElementBindings(msg.data || {});
      }

      if (msg.type === MESSAGE_TYPES.COMPONENT_SPEC_JSON) {
        try {
          if (!astGeneratorRef.current) {
            console.error("AST Generator가 초기화되지 않았습니다.");
            return;
          }

          // DSL 데이터를 ComponentDSL 타입으로 변환
          const dsl = msg.data as ComponentDSL;

          // AST Generator를 사용하여 코드 생성
          const code = astGeneratorRef.current.generateCodeFromDSL(dsl);

          // 생성된 코드를 state에 저장
          setGeneratedCode(code);
        } catch (error) {
          console.error("Failed to process COMPONENT_SPEC_JSON:", error);
          if (error instanceof Error) {
            console.error("Error stack:", error.stack);
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return {
    layers,
    componentSetInfo,
    savedPropertyConfig,
    componentStructure,
    layoutTree,
    internalStateDefinition,
    propsDefinition,
    elementBindings,
    extractJson,
    generatedCode,
  };
}
