import { useState, useEffect } from "react";
import type { PropDefinition, StateDefinition } from "../types";

/**
 * Props 정의 로드 hook (단순화)
 */
export function usePropsAndStates() {
  const [props, setProps] = useState<PropDefinition[]>([]);
  const [states, setStates] = useState<StateDefinition[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;

      if (msg.type === "props-definition") {
        setProps(msg.data || []);
      }

      if (msg.type === "internal-state-definition") {
        setStates(msg.data || []);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return {
    props,
    states,
  };
}
