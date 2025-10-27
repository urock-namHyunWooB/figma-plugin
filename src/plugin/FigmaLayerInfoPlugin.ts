import { NodeInfoExtractor } from "./extractors/NodeInfoExtractor";
import { MetadataManager } from "./managers/MetadataManager";
import { VariantManager } from "./managers/VariantManager";
import { SelectionManager } from "./managers/SelectionManager";
import { MessageHandler } from "./handlers/MessageHandler";

/**
 * 메인 플러그인 클래스
 * 단일 책임: 플러그인 초기화 및 전체 라이프사이클 관리
 */
export class FigmaLayerInfoPlugin {
  private nodeInfoExtractor: NodeInfoExtractor;
  private metadataManager: MetadataManager;
  private variantManager: VariantManager;
  private selectionManager: SelectionManager;
  private messageHandler: MessageHandler;

  constructor() {
    // 의존성 주입을 통한 클래스 인스턴스 생성
    this.nodeInfoExtractor = new NodeInfoExtractor();
    this.metadataManager = new MetadataManager();
    this.variantManager = new VariantManager();
    this.selectionManager = new SelectionManager(this.nodeInfoExtractor);
    this.messageHandler = new MessageHandler(
      this.variantManager,
      this.metadataManager,
      this.selectionManager,
      this.nodeInfoExtractor
    );
  }

  /**
   * 플러그인 초기화
   */
  async initialize(): Promise<void> {
    // UI 표시
    figma.showUI(__html__, { width: 600, height: 500 });

    // 초기 선택 정보 전송
    await this.selectionManager.sendCurrentSelection();

    // 선택 변경 이벤트 리스닝 시작
    this.selectionManager.startListening();

    // UI 메시지 핸들러 등록
    this.setupMessageHandler();
  }

  /**
   * UI 메시지 핸들러 설정
   */
  private setupMessageHandler(): void {
    figma.ui.onmessage = async (msg) => {
      await this.messageHandler.handleMessage(msg);
    };
  }
}
