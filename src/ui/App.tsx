import { useState, useEffect } from "react";
import MetadataSection from "./components/MetadataSection";
import LayerInfo from "./components/LayerInfo";
import React from "react";
import ExtractButton from "./components/ExtractButton";

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

function App() {
  const [layers, setLayers] = useState<LayerData[]>([]);

  useEffect(() => {
    // Listen for messages from plugin code
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;

      if (msg.type === "selection-info") {
        setLayers(msg.data);
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
    };
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
    <div className="flex flex-col h-full bg-gray-50 p-4">
      <h2 className="text-lg font-semibold mb-4">선택된 레이어 정보</h2>

      {/* Metadata Section */}
      {layers.length === 1 && (
        <MetadataSection
          metadataType={layers[0].metadataType}
          onChange={(type) => handleMetadataChange(layers[0].id, type)}
        />
      )}

      {/* Layer Info */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-2">
        {layers.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            레이어를 선택해주세요
          </div>
        ) : (
          layers.map((layer) => (
            <LayerInfo
              key={layer.id}
              layer={layer}
              onVariantChange={handleVariantChange}
            />
          ))
        )}
      </div>

      {/* Extract Button */}
      <ExtractButton />

      {/* Close Button */}
      <button
        onClick={handleClose}
        className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
      >
        닫기
      </button>
    </div>
  );
}

export default App;
