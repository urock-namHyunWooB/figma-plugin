import { useLayoutEffect, useRef, useState } from "react";
import { MESSAGE_TYPES } from "../../backend/types/messages";
import type { FigmaNodeData } from "./domain/code-generator2";

// 오버레이 최소 표시 시간 (ms).
// EXTRACTION_LOADING과 ON_SELECTION_CHANGE가 거의 동시에 도착해도
// 사용자가 인지할 수 있도록 최소 노출을 보장한다.
const OVERLAY_MIN_DISPLAY_MS = 400;

export default function useMessageHandler() {
  const [selectionNodeData, setSelectionNodeData] =
    useState<FigmaNodeData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const showStartRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const showOverlay = (): void => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      showStartRef.current = Date.now();
      setIsExtracting(true);
    };

    const hideOverlay = (): void => {
      if (showStartRef.current === null) {
        setIsExtracting(false);
        return;
      }
      const elapsed = Date.now() - showStartRef.current;
      if (elapsed >= OVERLAY_MIN_DISPLAY_MS) {
        showStartRef.current = null;
        setIsExtracting(false);
        return;
      }
      // 최소 시간 채우기 위해 hide 지연
      hideTimerRef.current = setTimeout(() => {
        showStartRef.current = null;
        hideTimerRef.current = null;
        setIsExtracting(false);
      }, OVERLAY_MIN_DISPLAY_MS - elapsed);
    };

    const handleMessage = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === MESSAGE_TYPES.EXTRACTION_LOADING) {
        showOverlay();
        return;
      }

      if (msg.type === MESSAGE_TYPES.ON_SELECTION_CHANGE) {
        setSelectionNodeData(msg.data);
        hideOverlay();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  return {
    selectionNodeData,
    setSelectionNodeData,
    isExtracting,
  };
}
