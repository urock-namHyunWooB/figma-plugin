import { useState, useEffect, useCallback } from "react";
import type { ElementBindingsMap } from "../types";

/**
 * Element Bindings 관리 hook (단순화)
 */
export function useElementBindings(initialBindings: ElementBindingsMap = {}) {
  const [bindings, setBindings] = useState<ElementBindingsMap>(initialBindings);
  const [savedBindings, setSavedBindings] =
    useState<ElementBindingsMap>(initialBindings);

  // initialBindings가 변경되면 state 업데이트
  useEffect(() => {
    setBindings(initialBindings);
    setSavedBindings(initialBindings);
  }, [initialBindings]);

  const connectProp = useCallback(
    (
      elementId: string,
      elementName: string,
      elementType: string,
      propName: string | null
    ) => {
      setBindings((prev) => {
        const newBindings = { ...prev };

        if (propName === null) {
          // 연결 해제
          const existing = newBindings[elementId];
          if (!existing) {
            return newBindings;
          }
          // prop 연결만 제거하고, visibility 관련 설정은 유지
          newBindings[elementId] = {
            ...existing,
            connectedPropName: null,
          };
        } else {
          // 연결 또는 업데이트
          newBindings[elementId] = {
            elementId,
            elementName,
            elementType,
            connectedPropName: propName,
            visibleMode: newBindings[elementId]?.visibleMode ?? "always",
            visibleExpression: newBindings[elementId]?.visibleExpression ?? "",
          };
        }

        return newBindings;
      });
    },
    []
  );

  const setVisibility = useCallback(
    (
      elementId: string,
      elementName: string,
      elementType: string,
      mode: "always" | "hidden" | "expression",
      expression?: string
    ) => {
      setBindings((prev) => {
        const newBindings = { ...prev };
        const prevBinding = newBindings[elementId];
        newBindings[elementId] = {
          elementId,
          elementName,
          elementType,
          connectedPropName: prevBinding?.connectedPropName ?? null,
          visibleMode: mode,
          visibleExpression: mode === "expression" ? expression ?? "" : "",
        };
        return newBindings;
      });
    },
    []
  );

  const saveBindings = useCallback(() => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "save-element-bindings",
          data: bindings,
        },
      },
      "*"
    );
    setSavedBindings(bindings);
  }, [bindings]);

  const resetBindings = useCallback(() => {
    setBindings(savedBindings);
  }, [savedBindings]);

  const hasUnsavedChanges = useCallback(() => {
    return JSON.stringify(bindings) !== JSON.stringify(savedBindings);
  }, [bindings, savedBindings]);

  return {
    bindings,
    savedBindings,
    connectProp,
    setVisibility,
    saveBindings,
    resetBindings,
    hasUnsavedChanges: hasUnsavedChanges(),
  };
}
