import { useLayoutEffect, useState } from "react";
import { ComponentStructureData } from "./domain/component-structure/types";
import { StateDefinition } from "../plugin/managers/MetadataManager";
import { PropDefinition } from "./utils/validation";

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
  const [extractJson, setExtractJson] = useState<string | null>(null);
  useLayoutEffect(() => {
    // Listen for messages from plugin code
    const handleMessage = (event: MessageEvent) => {
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
        console.log("msg.data", msg.data);
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
    extractJson,
  };
}
