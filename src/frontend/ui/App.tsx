import { useState } from "react";
import ComponentStructure from "./domain/component-structure/ComponentStructure";
import useMessageHandler from "./useMessageHandler";
import ComponentDocument from "./domain/component-document/ComponentDocument";
import SetInternalState from "./domain/setting-internal-state/SetInternalState";
import SetProps from "./domain/setting-props/SetProps";
import ComponentPreview from "./domain/code-preview/ComponentPreview";

function App() {
  const {
    layers,
    componentStructure,
    internalStateDefinition,
    propsDefinition,
    elementBindings,
    extractJson,
    generatedCode,
  } = useMessageHandler();

  const [activeTab, setActiveTab] = useState<"settings" | "preview">(
    "settings"
  );

  const handleClose = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 탭 헤더 */}
      {layers.length > 0 && layers[0].type === "COMPONENT_SET" && (
        <div className="flex border-b bg-white">
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-1 py-3 px-4 font-medium transition-colors ${
              activeTab === "settings"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`flex-1 py-3 px-4 font-medium transition-colors ${
              activeTab === "preview"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            👁️ Preview
          </button>
        </div>
      )}

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "settings" ? (
          <div className="p-4 space-y-4">
            {layers.length > 0 && layers[0].type === "COMPONENT_SET" && (
              <>
                <SetProps savedProps={propsDefinition ?? []} />
                <SetInternalState savedStates={internalStateDefinition ?? []} />

                {componentStructure && (
                  <ComponentStructure
                    structure={componentStructure}
                    props={propsDefinition ?? []}
                    states={internalStateDefinition ?? []}
                    initialBindings={elementBindings}
                  />
                )}
              </>
            )}

            <ComponentDocument extractJson={extractJson} />

            <button
              onClick={handleClose}
              className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="h-full">
            {generatedCode ? (
              <ComponentPreview 
                code={generatedCode} 
                propsDefinition={propsDefinition ?? []}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                코드를 먼저 생성해주세요
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
