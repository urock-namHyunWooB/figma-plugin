import { useState, useEffect, useCallback, useMemo } from "react";
import type { ElementBindingsMap } from "../types";
import type {
  PropDefinition,
  StateDefinition,
} from "@backend/managers/MetadataManager";

/**
 * Element Bindings 관리 hook (단순화)
 */
export function useElementBindings(
  initialBindings: ElementBindingsMap = {},
  props: PropDefinition[] = [],
  states: StateDefinition[] = [],
) {
  // initialBindings를 정규화: connectedPropName이 있지만 connectedTargetId가 없으면 id를 찾아서 설정
  const normalizedBindings = useMemo(() => {
    const normalized: ElementBindingsMap = {};
    for (const [elementId, binding] of Object.entries(initialBindings)) {
      let targetId = binding.connectedTargetId;

      // connectedTargetId가 없고 connectedPropName이 있으면 id를 찾아서 설정
      if (!targetId && binding.connectedPropName) {
        const propName = binding.connectedPropName;
        if (propName.startsWith("prop:")) {
          const name = propName.slice(5);
          const prop = props.find((p) => p.name === name);
          targetId = prop?.id ?? null;
        } else if (propName.startsWith("state:")) {
          const name = propName.slice(6);
          const state = states.find((s) => s.name === name);
          targetId = state?.id ?? null;
        } else {
          // prefix가 없는 경우: props 우선 확인 후 states 확인
          const prop = props.find((p) => p.name === propName);
          if (prop) {
            targetId = prop.id;
          } else {
            const state = states.find((s) => s.name === propName);
            targetId = state?.id ?? null;
          }
        }
      }

      normalized[elementId] = {
        ...binding,
        connectedTargetId: targetId ?? null,
      };
    }

    return normalized;
  }, [initialBindings, props, states]);

  const [bindings, setBindings] =
    useState<ElementBindingsMap>(normalizedBindings);
  const [savedBindings, setSavedBindings] =
    useState<ElementBindingsMap>(normalizedBindings);

  // normalizedBindings가 변경되면 state 업데이트
  useEffect(() => {
    setBindings(normalizedBindings);
    setSavedBindings(normalizedBindings);
  }, [normalizedBindings]);

  const connectProp = useCallback(
    (
      elementId: string,
      elementName: string,
      elementType: string,
      propName: string | null,
      targetId: string | null = null,
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
            connectedTargetId: null,
          };
        } else {
          // 연결 또는 업데이트
          newBindings[elementId] = {
            elementId,
            elementName,
            elementType,
            connectedPropName: propName,
            connectedTargetId: targetId,
            visibleMode: newBindings[elementId]?.visibleMode ?? "always",
            visibleExpression: newBindings[elementId]?.visibleExpression ?? "",
          };
        }

        return newBindings;
      });
    },
    [],
  );

  const setVisibility = useCallback(
    (
      elementId: string,
      elementName: string,
      elementType: string,
      mode: "always" | "hidden" | "expression",
      expression?: string,
    ) => {
      setBindings((prev) => {
        const newBindings = { ...prev };
        const prevBinding = newBindings[elementId];
        newBindings[elementId] = {
          elementId,
          elementName,
          elementType,
          connectedPropName: prevBinding?.connectedPropName ?? null,
          connectedTargetId: prevBinding?.connectedTargetId ?? null,
          visibleMode: mode,
          visibleExpression: mode === "expression" ? (expression ?? "") : "",
        };
        return newBindings;
      });
    },
    [],
  );

  const saveBindings = useCallback(() => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "save-element-bindings",
          data: bindings,
        },
      },
      "*",
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
