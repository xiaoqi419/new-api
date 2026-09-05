import type { SiteId } from "./env";
declare global {
  interface ImportMetaEnv {
    readonly VITE_DOMESTIC_API_BASE_URL: string;
    readonly VITE_INTERNATIONAL_API_BASE_URL: string;
    readonly VITE_DEFAULT_SITE: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
export {};
