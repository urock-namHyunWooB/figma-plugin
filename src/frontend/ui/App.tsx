import { useState } from "react";
import useMessageHandler from "./useMessageHandler";

function App() {
  const { selectionNodeData } = useMessageHandler();

  const [activeTab, setActiveTab] = useState<"settings" | "preview">(
    "settings"
  );

  const handleClose = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return <div></div>;
}

export default App;
