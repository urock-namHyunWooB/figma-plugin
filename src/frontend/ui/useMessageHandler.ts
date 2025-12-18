import { useLayoutEffect, useRef, useState } from "react";
import { MESSAGE_TYPES } from "../../backend/types/messages";
import FigmaCompiler, { FigmaNodeData } from "./domain/compiler";

export default function useMessageHandler() {
  const [selectionNodeData, setSelectionNodeData] =
    useState<FigmaNodeData | null>(null);

  const astGeneratorRef = useRef<FigmaCompiler | null>(null);

  useLayoutEffect(() => {
    if (!astGeneratorRef.current) {
      // astGeneratorRef.current = new FigmaCompiler(selectionNodeData);
    }
  }, []);

  useLayoutEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      const data = msg.data;

      if (msg.type === MESSAGE_TYPES.ON_SELECTION_CHANGE) {
        console.log("ON_SELECTION_CHANGE", data);

        setSelectionNodeData(data);
      }

      if (msg.type === MESSAGE_TYPES.ON_RUN) {
        setSelectionNodeData(data);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return {
    selectionNodeData,
  };
}
