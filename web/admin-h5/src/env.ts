export type SiteId = "domestic" | "international";

export interface SiteConfig {
  id: SiteId;
  label: string;
  baseUrl: string;
  configured: boolean;
}
export const siteIds: SiteId[] = ["domestic", "international"];
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
const configuredDefaultSite: SiteId =
  env.VITE_DEFAULT_SITE === "international" ? "international" : "domestic";

function matchesCurrentOrigin(site: SiteConfig): boolean {
  if (!site.baseUrl || typeof window === "undefined") return false;
  try {
    return new URL(site.baseUrl, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

// A single bundle is deployed on both public domains. Prefer the site whose
// configured API origin matches the current browser origin, then fall back to
// the explicit build default for other deployments.
export const defaultSiteId: SiteId =
  siteIds.find((siteId) => matchesCurrentOrigin(siteConfigs[siteId])) ?? configuredDefaultSite;
