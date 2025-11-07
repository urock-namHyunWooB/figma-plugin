import { useLayoutEffect, useRef, useState } from "react";
import {
  ComponentStructureData,
  ElementBindingsMap,
} from "./domain/component-structure/types";
import { StateDefinition } from "../../backend/managers/MetadataManager";
import { PropDefinition } from "./utils/validation";
import { initWasm } from "../wasm-engine";
import { MESSAGE_TYPES } from "../../backend/types/messages";

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

  const [internalStateDefinition, setInternalStateDefinition] = useState<
    StateDefinition[] | null
  >(null);

  const [propsDefinition, setPropsDefinition] = useState<
    PropDefinition[] | null
  >([]);

  const [elementBindings, setElementBindings] = useState<ElementBindingsMap>(
    {}
  );

  const [extractJson, setExtractJson] = useState<string | null>(null);

  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // Promise 기반으로 WASM 엔진 관리
  const enginePromise = useRef<Promise<any> | null>(null);

  useLayoutEffect(() => {
    // Promise를 생성하여 저장 (한 번만)
    enginePromise.current = (async () => {
      try {
        const wasm = await initWasm();

        const engine = new wasm.Engine();
        engine.init();

        return engine;
      } catch (error) {
        throw error;
      }
    })();
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

      if (msg.type === "component-structure") {
        setComponentStructure(msg.data);
      }

      if (msg.type === "internal-state-definition") {
        setInternalStateDefinition(msg.data);
      }

      if (msg.type === "props-definition") {
        setPropsDefinition(msg.data);
      }

      if (msg.type === "element-bindings") {
        setElementBindings(msg.data || {});
      }

      if (msg.type === MESSAGE_TYPES.COMPONENT_SPEC_JSON) {
        try {
          if (!enginePromise.current) {
            return;
          }

          const engine = await enginePromise.current;

          engine.setComponentSpec(msg.data);
          console.log(msg.data);

          const result = engine.generateCode("React", "button.tsx");

          // 생성된 코드를 state에 저장
          setGeneratedCode(result.code);
        } catch (error) {
          console.error("Failed to process COMPONENT_SPEC_JSON:", error);
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
    internalStateDefinition,
    propsDefinition,
    elementBindings,
    extractJson,
    generatedCode,
  };
}
