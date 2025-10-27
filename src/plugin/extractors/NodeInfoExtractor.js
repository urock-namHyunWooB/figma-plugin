"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.NodeInfoExtractor = void 0;
/**
 * 노드 정보를 추출하는 클래스
 * 단일 책임: Figma 노드로부터 필요한 정보를 추출하고 변환
 */
var NodeInfoExtractor = /** @class */ (function () {
    function NodeInfoExtractor() {
    }
    /**
     * 노드의 기본 정보 추출
     */
    NodeInfoExtractor.prototype.getBaseInfo = function (node) {
        return {
            id: node.id,
            name: node.name,
            type: node.type,
            visible: node.visible,
            locked: node.locked,
        };
    };
    /**
     * 위치 및 크기 정보 추출
     */
    NodeInfoExtractor.prototype.getGeometryInfo = function (node) {
        var info = {};
        if ("x" in node) {
            info.x = Math.round(node.x * 100) / 100;
            info.y = Math.round(node.y * 100) / 100;
        }
        if ("width" in node && "height" in node) {
            info.width = Math.round(node.width * 100) / 100;
            info.height = Math.round(node.height * 100) / 100;
        }
        if ("rotation" in node && node.rotation !== 0) {
            info.rotation = Math.round(node.rotation * 100) / 100;
        }
        return info;
    };
    /**
     * 스타일 정보 추출 (투명도, 블렌드 모드)
     */
    NodeInfoExtractor.prototype.getStyleInfo = function (node) {
        var info = {};
        if ("opacity" in node && node.opacity !== 1) {
            info.opacity = Math.round(node.opacity * 100) / 100;
        }
        if ("blendMode" in node && node.blendMode !== "PASS_THROUGH") {
            info.blendMode = node.blendMode;
        }
        return info;
    };
    /**
     * Fill 정보 추출
     */
    NodeInfoExtractor.prototype.getFillsInfo = function (node) {
        var info = {};
        if ("fills" in node && Array.isArray(node.fills)) {
            var fills = node.fills;
            if (fills.length > 0) {
                info.fills = fills.map(function (fill) {
                    if (fill.type === "SOLID") {
                        return {
                            type: fill.type,
                            color: {
                                r: Math.round(fill.color.r * 255),
                                g: Math.round(fill.color.g * 255),
                                b: Math.round(fill.color.b * 255),
                            },
                            opacity: fill.opacity || 1,
                        };
                    }
                    return { type: fill.type };
                });
            }
        }
        return info;
    };
    /**
     * Stroke 정보 추출
     */
    NodeInfoExtractor.prototype.getStrokeInfo = function (node) {
        var info = {};
        if ("strokes" in node && Array.isArray(node.strokes)) {
            var strokes = node.strokes;
            if (strokes.length > 0) {
                info.strokes = strokes.map(function (stroke) {
                    if (stroke.type === "SOLID") {
                        return {
                            type: stroke.type,
                            color: {
                                r: Math.round(stroke.color.r * 255),
                                g: Math.round(stroke.color.g * 255),
                                b: Math.round(stroke.color.b * 255),
                            },
                        };
                    }
                    return { type: stroke.type };
                });
            }
        }
        if ("strokeWeight" in node &&
            typeof node.strokeWeight === "number" &&
            node.strokeWeight > 0) {
            info.strokeWeight = node.strokeWeight;
        }
        return info;
    };
    /**
     * 텍스트 노드 정보 추출
     */
    NodeInfoExtractor.prototype.getTextInfo = function (node) {
        var info = {};
        if (node.type === "TEXT") {
            info.characters = node.characters;
            info.fontSize = node.fontSize;
            info.fontName = node.fontName;
            info.textAlignHorizontal = node.textAlignHorizontal;
            info.textAlignVertical = node.textAlignVertical;
        }
        return info;
    };
    /**
     * 레이아웃 정보 추출 (Auto Layout)
     */
    NodeInfoExtractor.prototype.getLayoutInfo = function (node) {
        var info = {};
        if ("children" in node) {
            info.childrenCount = node.children.length;
        }
        if ("layoutMode" in node && node.layoutMode !== "NONE") {
            info.layoutMode = node.layoutMode;
            info.primaryAxisSizingMode = node.primaryAxisSizingMode;
            info.counterAxisSizingMode = node.counterAxisSizingMode;
            info.paddingLeft = node.paddingLeft;
            info.paddingRight = node.paddingRight;
            info.paddingTop = node.paddingTop;
            info.paddingBottom = node.paddingBottom;
            info.itemSpacing = node.itemSpacing;
        }
        if ("cornerRadius" in node && node.cornerRadius !== 0) {
            info.cornerRadius = node.cornerRadius;
        }
        return info;
    };
    /**
     * Effects 정보 추출
     */
    NodeInfoExtractor.prototype.getEffectsInfo = function (node) {
        var info = {};
        if ("effects" in node && node.effects.length > 0) {
            info.effects = node.effects.map(function (effect) { return ({
                type: effect.type,
                visible: effect.visible,
            }); });
        }
        return info;
    };
    /**
     * Component Instance 정보 추출
     */
    NodeInfoExtractor.prototype.getComponentInfo = function (node) {
        return __awaiter(this, void 0, void 0, function () {
            var info, instance, mainComponent, parent_1, componentSet, variantOptions_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        info = {};
                        if (!(node.type === "INSTANCE")) return [3 /*break*/, 2];
                        instance = node;
                        info.isInstance = true;
                        if (instance.componentProperties) {
                            info.componentProperties = instance.componentProperties;
                            console.log("Component Properties:", instance.componentProperties);
                        }
                        return [4 /*yield*/, instance.getMainComponentAsync()];
                    case 1:
                        mainComponent = _a.sent();
                        if (mainComponent) {
                            info.mainComponentName = mainComponent.name;
                            info.mainComponentId = mainComponent.id;
                            parent_1 = mainComponent.parent;
                            console.log("Parent type:", parent_1 === null || parent_1 === void 0 ? void 0 : parent_1.type);
                            if (parent_1 && parent_1.type === "COMPONENT_SET") {
                                info.componentSetName = parent_1.name;
                                componentSet = parent_1;
                                variantOptions_1 = {};
                                if (componentSet.componentPropertyDefinitions) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    Object
                                        .entries(componentSet.componentPropertyDefinitions)
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        .forEach(function (_a) {
                                        var key = _a[0], definition = _a[1];
                                        if (definition.type === "VARIANT" &&
                                            definition.variantOptions) {
                                            variantOptions_1[key] = definition.variantOptions;
                                        }
                                    });
                                }
                                console.log("Available Variants:", variantOptions_1);
                                info.availableVariants = variantOptions_1;
                            }
                        }
                        _a.label = 2;
                    case 2: return [2 /*return*/, info];
                }
            });
        });
    };
    /**
     * 노드의 모든 속성 추출 (public API)
     */
    NodeInfoExtractor.prototype.extractNodeProperties = function (node) {
        return __awaiter(this, void 0, void 0, function () {
            var properties, _a, metadataType;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = [__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign({}, this.getBaseInfo(node)), this.getGeometryInfo(node)), this.getStyleInfo(node)), this.getFillsInfo(node)), this.getStrokeInfo(node)), this.getTextInfo(node)), this.getLayoutInfo(node)), this.getEffectsInfo(node))];
                        return [4 /*yield*/, this.getComponentInfo(node)];
                    case 1:
                        properties = __assign.apply(void 0, _a.concat([(_b.sent())]));
                        metadataType = node.getPluginData("metadata-type");
                        if (metadataType) {
                            properties.metadataType = metadataType;
                        }
                        return [2 /*return*/, properties];
                }
            });
        });
    };
    return NodeInfoExtractor;
}());
exports.NodeInfoExtractor = NodeInfoExtractor;
