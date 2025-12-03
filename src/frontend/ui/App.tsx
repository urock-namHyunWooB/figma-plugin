import { useState } from "react";
import useMessageHandler from "./useMessageHandler";
import ComponentPreview from "@frontend/ui/domain/code-preview/ComponentPreview";
import { TestComp } from "@frontend/ui/test-components/TestComp";

function App() {
  const { selectionNodeData } = useMessageHandler();

  const [activeTab, setActiveTab] = useState<"settings" | "preview">(
    "settings"
  );

  const handleClose = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return (
    <div>
      <TestComp />
    </div>
  );
}

export default App;
