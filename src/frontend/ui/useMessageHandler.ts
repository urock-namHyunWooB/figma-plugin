import { useLayoutEffect, useState } from "react";
import { MESSAGE_TYPES } from "../../backend/types/messages";
import { FigmaNodeData } from "./domain/code-generator";

export default function useMessageHandler() {
  const [selectionNodeData, setSelectionNodeData] =
    useState<FigmaNodeData | null>(null);

  useLayoutEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === MESSAGE_TYPES.ON_SELECTION_CHANGE) {
        setSelectionNodeData(msg.data);
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
