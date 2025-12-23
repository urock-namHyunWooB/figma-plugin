import { useEffect, useState } from "react";
import useMessageHandler from "./useMessageHandler";

import FigmaCompiler from "@compiler";

function App() {
  const { selectionNodeData } = useMessageHandler();

  useEffect(() => {
    if (!selectionNodeData) return;
    const figmaCompiler = new FigmaCompiler(selectionNodeData);
    figmaCompiler.getGeneratedCode().then((code) => console.log(code));
  }, [selectionNodeData]);

  return <div>dd</div>;
}

export default App;
