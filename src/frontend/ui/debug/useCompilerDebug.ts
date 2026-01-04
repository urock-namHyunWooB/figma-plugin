import { useEffect, useMemo, useReducer, useRef } from "react";

import FigmaCompiler from "@frontend/ui/domain/compiler";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";
import { toCamelCase } from "@compiler/utils/normalizeString";
import type { FigmaNodeData } from "@compiler/types/baseType";

type Status = "idle" | "compiling" | "ready" | "error";

type State = {
  status: Status;
  code: string;
  Component: React.ComponentType<any> | null;
  error: string | null;
  compileMs: number | null;
};

type Action =
  | { type: "COMPILE_START" }
  | {
      type: "COMPILE_SUCCESS";
      payload: {
        code: string;
        Component: React.ComponentType<any>;
        compileMs: number;
      };
    }
  | { type: "COMPILE_ERROR"; payload: { error: string } };

const initialState: State = {
  status: "idle",
  code: "",
  Component: null,
  error: null,
  compileMs: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "COMPILE_START":
      return {
        status: "compiling",
        code: "",
        Component: null,
        error: null,
        compileMs: null,
      };
    case "COMPILE_SUCCESS":
      return {
        status: "ready",
        code: action.payload.code,
        Component: action.payload.Component,
        error: null,
        compileMs: action.payload.compileMs,
      };
    case "COMPILE_ERROR":
      return {
        status: "error",
        code: "",
        Component: null,
        error: action.payload.error,
        compileMs: null,
      };
    default:
      return state;
  }
}

function getDefaultPropsFromSpec(spec: FigmaNodeData): Record<string, any> {
  const defs =
    "componentPropertyDefinitions" in spec.info.document
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (spec.info.document as any).componentPropertyDefinitions
      : null;

  if (!defs || typeof defs !== "object") return {};

  const props: Record<string, any> = {};
  Object.entries(defs).forEach(([rawKey, def]) => {
    if (!def || typeof def !== "object") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultValue = (def as any).defaultValue;
    if (defaultValue === undefined) return;
    props[toCamelCase(rawKey)] = defaultValue;
  });

  return props;
}

export function useCompilerDebug(spec: FigmaNodeData) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const compileIdRef = useRef(0);

  const defaultProps = useMemo(() => getDefaultPropsFromSpec(spec), [spec]);

  useEffect(() => {
    let isMounted = true;
    const compileId = ++compileIdRef.current;

    async function compile() {
      dispatch({ type: "COMPILE_START" });

      const start = performance.now();
      try {
        const compiler = new FigmaCompiler(spec);
        const code = await compiler.getGeneratedCode();
        if (!code) throw new Error("코드 생성 실패");

        const Component = await renderReactComponent(code);

        if (!isMounted) return;
        if (compileId !== compileIdRef.current) return;

        dispatch({
          type: "COMPILE_SUCCESS",
          payload: {
            code,
            Component,
            compileMs: Math.round(performance.now() - start),
          },
        });
      } catch (err) {
        console.error("err");
        if (!isMounted) return;
        if (compileId !== compileIdRef.current) return;

        dispatch({
          type: "COMPILE_ERROR",
          payload: {
            error: err instanceof Error ? err.message : "알 수 없는 오류",
          },
        });
      }
    }

    compile();

    return () => {
      isMounted = false;
    };
  }, [spec]);

  return {
    ...state,
    defaultProps,
  };
}
