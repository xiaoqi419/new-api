export type SiteId = "domestic" | "international";

export interface SiteConfig {
  id: SiteId;
  label: string;
  baseUrl: string;
  configured: boolean;
}
interface BuildEnv {
  VITE_DOMESTIC_API_BASE_URL?: string;
  VITE_INTERNATIONAL_API_BASE_URL?: string;
  VITE_DEFAULT_SITE?: string;
}
const env = (import.meta as ImportMeta & { env: BuildEnv }).env;
function baseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(
      trimmed,
      typeof window === "undefined" ? "http://localhost" : window.location.origin,
    );
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return trimmed.replace(/\/$/, "");
  } catch {
    return "";
  }
}
export const siteConfigs: Record<SiteId, SiteConfig> = {
  domestic: {
    id: "domestic",
    label: "Domestic",
    baseUrl: baseUrl(env.VITE_DOMESTIC_API_BASE_URL),
    configured: env.VITE_DOMESTIC_API_BASE_URL !== undefined,
  },
  international: {
    id: "international",
    label: "International",
    baseUrl: baseUrl(env.VITE_INTERNATIONAL_API_BASE_URL),
    configured: env.VITE_INTERNATIONAL_API_BASE_URL !== undefined,
  },
};
export const siteIds: SiteId[] = ["domestic", "international"];
export const defaultSiteId: SiteId =
  env.VITE_DEFAULT_SITE === "international" ? "international" : "domestic";
