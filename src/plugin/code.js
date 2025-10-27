"use strict";
// This plugin displays information about selected layers in Figma
Object.defineProperty(exports, "__esModule", { value: true });
var FigmaLayerInfoPlugin_1 = require("./FigmaLayerInfoPlugin");
// 플러그인 실행
var plugin = new FigmaLayerInfoPlugin_1.FigmaLayerInfoPlugin();
plugin.initialize();
