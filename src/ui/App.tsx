import ComponentStructure from "./domain/component-structure/ComponentStructure";
import useMessageHandler from "./useMessageHandler";
import ComponentDocument from "./domain/component-document/ComponentDocument";
import SetInternalState from "./domain/setting-internal-state/SetInternalState";
import SetProps from "./domain/setting-props/SetProps";

function App() {
  const {
    layers,
    componentStructure,
    internalStateDefinition,
    propsDefinition,
    elementBindings,
    extractJson,
  } = useMessageHandler();

  const handleClose = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
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
    </div>
  );
}

export default App;
