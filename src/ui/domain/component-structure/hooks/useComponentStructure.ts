import { useState, useEffect } from "react";
import type { ComponentStructureData } from "../types";

/**
 * Component Structure 데이터 관리 hook
 */
export function useComponentStructure() {
  const [structure, setStructure] = useState<ComponentStructureData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;

      if (msg.type === "component-structure") {
        setStructure(msg.data);
        setIsLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return {
    structure,
    isLoading,
  };
}

