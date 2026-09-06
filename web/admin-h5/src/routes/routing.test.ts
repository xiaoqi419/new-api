import { afterEach, describe, expect, it } from "vitest";

import { router } from "../router";
import { authStore } from "../stores/auth-store";

const adminBundle = {
  access_token: "route-token",
  token_type: "Bearer",
  access_expires_at: 1_900_000_000,
  user: { id: 1, username: "admin", role: 10 },
  session: {
    sid: "route-session",
    current: true,
    login_method: "password",
    expires_at: 1_900_100_000,
  },
};

const protectedRoutes = [
  { to: "/users" as const },
  { to: "/users/$id" as const, params: { id: "example" } },
  { to: "/stats" as const },
];

afterEach(() => {
  authStore.getState().reset();
});

describe("protected admin routes", () => {
  it.each(protectedRoutes)("redirects unauthenticated users from $to to sign-in", async (route) => {
    await router.navigate(route);
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  it.each(protectedRoutes)("redirects non-admin users from $to to sign-in", async (route) => {
    authStore.getState().installBundle({
      ...adminBundle,
      user: { ...adminBundle.user, role: 9 },
    });

    await router.navigate(route);
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  it.each(protectedRoutes)("redirects malformed-role users from $to to sign-in", async (route) => {
    authStore.getState().installBundle({
      ...adminBundle,
      user: { ...adminBundle.user, role: "10" },
    });

    await router.navigate(route);
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  it("redirects authenticated admins away from sign-in", async () => {
    authStore.getState().installBundle(adminBundle);
    await router.navigate({ to: "/sign-in" });
    expect(router.state.location.pathname).toBe("/users");
  });
});
