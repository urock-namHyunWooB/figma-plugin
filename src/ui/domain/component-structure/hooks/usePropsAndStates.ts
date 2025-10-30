import { useState, useEffect } from "react";
import type { PropDefinition } from "../types";

/**
 * Props 정의 로드 hook (단순화)
 */
export function usePropsAndStates() {
  const [props, setProps] = useState<PropDefinition[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;

      if (msg.type === "props-definition") {
        setProps(msg.data || []);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return {
    props,
  };
}

