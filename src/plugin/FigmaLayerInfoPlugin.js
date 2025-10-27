"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FigmaLayerInfoPlugin = void 0;
var NodeInfoExtractor_1 = require("./extractors/NodeInfoExtractor");
var MetadataManager_1 = require("./managers/MetadataManager");
var VariantManager_1 = require("./managers/VariantManager");
var SelectionManager_1 = require("./managers/SelectionManager");
var MessageHandler_1 = require("./handlers/MessageHandler");
/**
 * 메인 플러그인 클래스
 * 단일 책임: 플러그인 초기화 및 전체 라이프사이클 관리
 */
var FigmaLayerInfoPlugin = /** @class */ (function () {
    function FigmaLayerInfoPlugin() {
        // 의존성 주입을 통한 클래스 인스턴스 생성
        this.nodeInfoExtractor = new NodeInfoExtractor_1.NodeInfoExtractor();
        this.metadataManager = new MetadataManager_1.MetadataManager();
        this.variantManager = new VariantManager_1.VariantManager();
        this.selectionManager = new SelectionManager_1.SelectionManager(this.nodeInfoExtractor);
        this.messageHandler = new MessageHandler_1.MessageHandler(this.variantManager, this.metadataManager, this.selectionManager);
    }
    /**
     * 플러그인 초기화
     */
    FigmaLayerInfoPlugin.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // UI 표시
                        figma.showUI(__html__, { width: 600, height: 500 });
                        // 초기 선택 정보 전송
                        return [4 /*yield*/, this.selectionManager.sendCurrentSelection()];
                    case 1:
                        // 초기 선택 정보 전송
                        _a.sent();
                        // 선택 변경 이벤트 리스닝 시작
                        this.selectionManager.startListening();
                        // UI 메시지 핸들러 등록
                        this.setupMessageHandler();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * UI 메시지 핸들러 설정
     */
    FigmaLayerInfoPlugin.prototype.setupMessageHandler = function () {
        var _this = this;
        figma.ui.onmessage = function (msg) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.messageHandler.handleMessage(msg)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); };
    };
    return FigmaLayerInfoPlugin;
}());
exports.FigmaLayerInfoPlugin = FigmaLayerInfoPlugin;
