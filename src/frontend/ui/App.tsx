import { useState } from "react";
import useMessageHandler from "./useMessageHandler";

import { TestComp } from "@frontend/ui/debug/TestComp";
import Primary from "@frontend/ui/examples/taptapButton_styled";

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
      <Primary text="Button" />

      <TestComp />
    </div>
  );
}

export default App;
