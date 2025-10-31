/// <reference types="@figma/plugin-typings" />

// This plugin displays information about selected layers in Figma

import { FigmaPlugin } from "./FigmaPlugin";

// 플러그인 실행
const plugin = new FigmaPlugin();
plugin.initialize();
