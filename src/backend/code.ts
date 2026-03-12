/// <reference types="@figma/plugin-typings" />

declare const GITHUB_TOKEN: string;

import { FigmaPlugin } from "./FigmaPlugin";

const plugin = new FigmaPlugin();
plugin.initialize();
