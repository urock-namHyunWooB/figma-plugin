import { useEffect, useMemo, useReducer, useRef } from "react";

import FigmaCodeGenerator from "@frontend/ui/domain/code-generator2";
import type { GeneratorOptions, FigmaNodeData } from "@frontend/ui/domain/code-generator2";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";

export type StyleStrategyType = "emotion" | "tailwind";

export interface CompilerDebugOptions {
  styleStrategy?: StyleStrategyType;
}

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

function toCamelCase(str: string): string {
  return str
    .split(/[\s_#-]+/)
    .filter(Boolean)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
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

export function useCompilerDebug(
  spec: FigmaNodeData | null,
  options?: CompilerDebugOptions
) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const compileIdRef = useRef(0);

  const defaultProps = useMemo(
    () => (spec ? getDefaultPropsFromSpec(spec) : {}),
    [spec]
  );

  // styleStrategy 옵션을 GeneratorOptions로 변환
  const compilerOptions: GeneratorOptions | undefined = useMemo(() => {
    if (!options?.styleStrategy || options.styleStrategy === "emotion") {
      return undefined; // 기본값 (Emotion)
    }
    return {
      styleStrategy: options.styleStrategy,
    };
  }, [options?.styleStrategy]);

  useEffect(() => {
    if (!spec) return;

    let isMounted = true;
    const compileId = ++compileIdRef.current;

    async function compile() {
      dispatch({ type: "COMPILE_START" });

      const start = performance.now();
      try {
        const compiler = new FigmaCodeGenerator(spec!, compilerOptions);
        const code = await compiler.compile();
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
  }, [spec, compilerOptions]);

  return {
    ...state,
    defaultProps,
  };
}
