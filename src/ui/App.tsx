import { useState, useEffect } from "react";
import MetadataSection from "./components/MetadataSection";
import LayerInfo from "./components/LayerInfo";

import ExtractButton from "./components/ExtractButton";
import ComponentProperty from "./components/ComponentProperty";
import SetProps from "./components/SetProps";
import SetInternalState from "./components/SetInternalState";
import ComponentStructure from "./domain/component-structure/ComponentStructure";

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

// Component Property 설정 인터페이스
interface PropertyConfig {
  name: string;
  type: "BOOLEAN" | "TEXT" | "VARIANT";
  required: boolean;
  is_prop: boolean;
  initValue: string | boolean | null;
  variantOptions?: string[];
}

function App() {
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [componentSetInfo, setComponentSetInfo] =
    useState<ComponentPropertyDefinitions | null>(null);
  const [savedPropertyConfig, setSavedPropertyConfig] = useState<
    PropertyConfig[] | null
  >(null);

  useEffect(() => {
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

      if (msg.type === "download-json") {
        const blob = new Blob([event.data.pluginMessage.data], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "figma-data.json";
        a.click();
        URL.revokeObjectURL(url);
      }

      // Note: props-definition and internal-state-definition messages
      // are handled by SetProps and SetInternalState components
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleMetadataChange = (nodeId: string, metadataType: string) => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "set-metadata",
          nodeId,
          metadataType,
        },
      },
      "*"
    );
  };

  const handleVariantChange = (
    nodeId: string,
    propertyName: string,
    value: string
  ) => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "change-variant",
          nodeId,
          propertyName,
          value,
        },
      },
      "*"
    );
  };

  const handleClose = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        {layers.length > 0 && layers[0].type === "COMPONENT_SET" && (
          <>
            <SetProps />
            <SetInternalState />
            <ComponentStructure />
          </>
        )}

        <button
          onClick={handleClose}
          className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

export default App;
