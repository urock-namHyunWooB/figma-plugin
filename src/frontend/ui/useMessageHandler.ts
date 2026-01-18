import { useLayoutEffect, useRef, useState, useCallback } from "react";
import { MESSAGE_TYPES } from "../../backend/types/messages";
import FigmaCompiler, { FigmaNodeData } from "./domain/compiler";

/** Variant 정보 */
export interface VariantInfo {
  id: string;
  name: string;
  variantProps: Record<string, string>;
  imageBase64?: string | null;
  nodeData?: FigmaNodeData | null; // variant의 nodeData (Export JSON용)
}

/** 스캔된 아이템 정보 */
export interface ScanItem {
  id: string;
  name: string;
  nodeType: string;
  nodeData: FigmaNodeData;
  imageBase64?: string | null; // Figma 원본 이미지 (PNG, base64)
  variants?: VariantInfo[] | null; // COMPONENT_SET의 variant 정보
}

/** 스캔 상태 */
export interface ScanState {
  isScanning: boolean;
  pageName: string;
  total: number;
  current: number;
  succeeded: number;
  failed: number;
  items: ScanItem[];
  errors: Array<{ id: string; name: string; error: string }>;
}

const initialScanState: ScanState = {
  isScanning: false,
  pageName: "",
  total: 0,
  current: 0,
  succeeded: 0,
  failed: 0,
  items: [],
  errors: [],
};

export default function useMessageHandler() {
  const [selectionNodeData, setSelectionNodeData] =
    useState<FigmaNodeData | null>(null);
  const [scanState, setScanState] = useState<ScanState>(initialScanState);

  const astGeneratorRef = useRef<FigmaCompiler | null>(null);

  useLayoutEffect(() => {
    if (!astGeneratorRef.current) {
      // astGeneratorRef.current = new FigmaCompiler(selectionNodeData);
    }
  }, []);

  useLayoutEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      const data = msg.data;

      if (msg.type === MESSAGE_TYPES.ON_SELECTION_CHANGE) {
        setSelectionNodeData(data);
      }

      if (msg.type === MESSAGE_TYPES.ON_RUN) {
        setSelectionNodeData(data);
      }

      // 스캔 관련 메시지 처리
      if (msg.type === MESSAGE_TYPES.SCAN_STARTED) {
        setScanState({
          isScanning: true,
          pageName: msg.pageName || "",
          total: msg.total || 0,
          current: 0,
          succeeded: 0,
          failed: 0,
          items: [],
          errors: [],
        });
      }

      if (msg.type === MESSAGE_TYPES.SCAN_ITEM) {
        setScanState((prev) => ({
          ...prev,
          current: msg.current,
          succeeded: prev.succeeded + 1,
          items: [...prev.items, msg.item],
        }));
      }

      if (msg.type === MESSAGE_TYPES.SCAN_ITEM_ERROR) {
        setScanState((prev) => ({
          ...prev,
          failed: prev.failed + 1,
          errors: [
            ...prev.errors,
            { id: msg.id, name: msg.name, error: msg.error },
          ],
        }));
      }

      if (msg.type === MESSAGE_TYPES.SCAN_COMPLETE) {
        setScanState((prev) => ({
          ...prev,
          isScanning: false,
          succeeded: msg.succeeded,
          failed: msg.failed,
        }));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const startScan = useCallback(() => {
    parent.postMessage(
      { pluginMessage: { type: MESSAGE_TYPES.SCAN_PAGE } },
      "*"
    );
  }, []);

  const resetScan = useCallback(() => {
    setScanState(initialScanState);
  }, []);

  return {
    selectionNodeData,
    scanState,
    startScan,
    resetScan,
  };
}
