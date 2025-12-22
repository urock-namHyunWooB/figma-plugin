import { useState } from "react";
import useMessageHandler from "./useMessageHandler";

import { TestComp } from "@frontend/ui/debug/TestComp";
import Primary from "@frontend/ui/examples/taptapButton_styled";
import Primary2 from "@frontend/ui/examples/taptapButton_styled2";

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
      <Primary text="Button" size={"Large"} />

      <Primary2 text="Button" />

      <TestComp />
    </div>
  );
}

export default App;
