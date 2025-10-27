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
exports.MessageHandler = void 0;
/**
 * 메시지 핸들러 및 UI 통신 클래스
 * 단일 책임: UI로부터 받은 메시지 처리 및 UI와의 통신
 */
var MessageHandler = /** @class */ (function () {
    function MessageHandler(variantManager, metadataManager, selectionManager) {
        this.variantManager = variantManager;
        this.metadataManager = metadataManager;
        this.selectionManager = selectionManager;
    }
    /**
     * UI로 선택 정보 전송
     */
    MessageHandler.prototype.sendSelectionInfo = function (data) {
        figma.ui.postMessage({
            type: "selection-info",
            data: data,
        });
    };
    /**
     * 알림 메시지 표시
     */
    MessageHandler.prototype.notify = function (message) {
        figma.notify(message);
    };
    /**
     * 메시지 처리
     */
    MessageHandler.prototype.handleMessage = function (msg) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = msg.type;
                        switch (_a) {
                            case "cancel": return [3 /*break*/, 1];
                            case "change-variant": return [3 /*break*/, 3];
                            case "set-metadata": return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, this.handleCancel()];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 3: return [4 /*yield*/, this.handleChangeVariant(msg)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, this.handleSetMetadata(msg)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    MessageHandler.prototype.handleCancel = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                figma.closePlugin();
                return [2 /*return*/];
            });
        });
    };
    MessageHandler.prototype.handleChangeVariant = function (msg) {
        return __awaiter(this, void 0, void 0, function () {
            var success;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!msg.nodeId || !msg.propertyName || !msg.value) {
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.variantManager.changeVariant(msg.nodeId, msg.propertyName, msg.value)];
                    case 1:
                        success = _a.sent();
                        if (!success) return [3 /*break*/, 3];
                        this.notify("Variant \uBCC0\uACBD\uB428: ".concat(msg.propertyName, " = ").concat(msg.value));
                        return [4 /*yield*/, this.selectionManager.sendCurrentSelection()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        this.notify("Variant 변경 실패");
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MessageHandler.prototype.handleSetMetadata = function (msg) {
        return __awaiter(this, void 0, void 0, function () {
            var success;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!msg.nodeId || !msg.metadataType) {
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.metadataManager.setMetadata(msg.nodeId, msg.metadataType)];
                    case 1:
                        success = _a.sent();
                        if (!success) return [3 /*break*/, 3];
                        this.notify("\uBA54\uD0C0\uB370\uC774\uD130 \uC124\uC815\uB428: ".concat(msg.metadataType));
                        return [4 /*yield*/, this.selectionManager.sendCurrentSelection()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        this.notify("메타데이터 설정 실패");
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return MessageHandler;
}());
exports.MessageHandler = MessageHandler;
