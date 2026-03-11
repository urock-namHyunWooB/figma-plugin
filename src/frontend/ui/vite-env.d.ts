/// <reference types="vite/client" />

declare const __DEV_BUILD__: boolean;

interface ImportMetaEnv {
  readonly VITE_GITHUB_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
