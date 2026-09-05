import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { siteConfigs, type SiteId } from "../env";
import {
  isAdminUser,
  isAuthBundle,
  type ApiResponse,
  type AuthBundle,
} from "../features/auth/types";
import { authStore } from "../stores/auth-store";
export const APP_SIGN_IN_PATH = "/sign-in";
export const SITE_CONFIG_ERROR = "This site is not configured. Contact the administrator.";
let authNavigation: ((siteId: SiteId) => void) | null = null;
export function setAuthNavigation(handler: ((siteId: SiteId) => void) | null): void {
  authNavigation = handler;
}
type AuthRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
  _authGeneration?: number;
};
const refreshPromises: Partial<Record<SiteId, Promise<AuthBundle>>> = {};
export function getApiClient(siteId: SiteId, bare = false): AxiosInstance {
  const client = axios.create({
    baseURL: siteConfigs[siteId].baseUrl || undefined,
    withCredentials: true,
    headers: { "Cache-Control": "no-store" },
  });
  if (!siteConfigs[siteId].configured) {
    client.defaults.adapter = async () => {
      throw new Error(SITE_CONFIG_ERROR);
    };
  }
  if (bare) return client;
  client.interceptors.request.use((config) => {
    const current = authStore.getState().sites[siteId];
    (config as AuthRequestConfig)._authGeneration = current.generation;
    config.headers.set("Cache-Control", "no-store");
    if (current.accessToken) config.headers.set("Authorization", `Bearer ${current.accessToken}`);
    return config;
  });
  client.interceptors.response.use(
    (r) => r,
    async (error: AxiosError) => {
      const config = error.config as AuthRequestConfig | undefined;
      if (error.response?.status !== 401 || !config || config._authRetry)
        return Promise.reject(error);
      config._authRetry = true;
      try {
        const bundle = await getRefreshPromise(siteId);
        authStore.getState().installBundle(bundle, siteId, config._authGeneration);
        return client.request(config);
      } catch (e) {
        handleAuthRefreshFailure(siteId, config._authGeneration);
        return Promise.reject(e);
      }
    },
  );
  return client;
}
export const apiClients: Record<SiteId, AxiosInstance> = {
  domestic: getApiClient("domestic"),
  international: getApiClient("international"),
};
export const bareApiClients: Record<SiteId, AxiosInstance> = {
  domestic: getApiClient("domestic", true),
  international: getApiClient("international", true),
};
function currentClient(clients: Record<SiteId, AxiosInstance>): AxiosInstance {
  return clients[authStore.getState().activeSiteId];
}
function dynamicClient(clients: Record<SiteId, AxiosInstance>): AxiosInstance {
  return new Proxy(clients.domestic, {
    get(_target, property) {
      const value = Reflect.get(currentClient(clients), property);
      return typeof value === "function" ? value.bind(currentClient(clients)) : value;
    },
    set(_target, property, value) {
      Reflect.set(currentClient(clients), property, value);
      return true;
    },
  }) as AxiosInstance;
}
// Existing feature modules use these aliases; the proxy resolves the active site at request time.
export const apiClient = dynamicClient(apiClients);
export const bareApiClient = dynamicClient(bareApiClients);
export function clientFor(siteId: SiteId, bare = false): AxiosInstance {
  if (siteId === authStore.getState().activeSiteId) return bare ? bareApiClient : apiClient;
  return bare ? bareApiClients[siteId] : apiClients[siteId];
}
export function handleAuthRecoverySuccess(
  siteId: SiteId = authStore.getState().activeSiteId,
): void {
  void siteId;
}
export function handleAuthRefreshFailure(
  siteId: SiteId = authStore.getState().activeSiteId,
  expectedGeneration?: number,
): void {
  const current = authStore.getState().sites[siteId];
  if (expectedGeneration !== undefined && current.generation !== expectedGeneration) return;
  authStore.getState().markNeedsSignIn(siteId);
  navigateToSignIn(siteId);
}
async function refreshBundle(siteId: SiteId): Promise<AuthBundle> {
  const sid = authStore.getState().sites[siteId].session?.sid;
  const response = await clientFor(siteId, true).post<ApiResponse<AuthBundle>>(
    "/api/user/auth/refresh",
    undefined,
    sid ? { headers: { "X-Auth-Session": sid } } : undefined,
  );
  if (
    !response.data.success ||
    !isAuthBundle(response.data.data) ||
    !isAdminUser(response.data.data.user)
  )
    throw response.data;
  return response.data.data;
}
function getRefreshPromise(siteId: SiteId): Promise<AuthBundle> {
  refreshPromises[siteId] ??= refreshBundle(siteId).finally(() => {
    delete refreshPromises[siteId];
  });
  return refreshPromises[siteId]!;
}
export function navigateToSignIn(siteId: SiteId = authStore.getState().activeSiteId): void {
  if (authNavigation) {
    authNavigation(siteId);
    return;
  }
  // Kept as a compatibility fallback for non-mounted API consumers and tests.
  if (typeof window !== "undefined" && typeof window.location?.assign === "function")
    window.location.assign(APP_SIGN_IN_PATH);
}
