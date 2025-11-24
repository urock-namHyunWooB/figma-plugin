import { useLayoutEffect, useRef, useState } from "react";
import { MESSAGE_TYPES } from "../../backend/types/messages";
import { ASTGenerator, TagMapper } from "./domain/transpiler";
import { FigmaNodeData } from "./domain/transpiler/types/figma-api";

export default function useMessageHandler() {
  const [selectionNodeData, setSelectionNodeData] =
    useState<FigmaNodeData | null>(null);

  const astGeneratorRef = useRef<ASTGenerator | null>(null);

  useLayoutEffect(() => {
    if (!astGeneratorRef.current) {
      astGeneratorRef.current = new ASTGenerator(new TagMapper());
    }
  }, []);

  useLayoutEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
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
