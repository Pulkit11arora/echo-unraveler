/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SEPARATE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
