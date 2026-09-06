import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";

import { isAdminUser } from "./features/auth/types";
import { AppErrorFallback, AppNotFoundFallback, RootLayout } from "./routes/__root";
import { SignInPage } from "./routes/sign-in";
import { UserDetailPage } from "./routes/users.$id";
import { validateStatsSearch } from "./features/stats/range";
import { StatsRoutePage } from "./routes/stats";
import { validateUsersSearch, UsersPage } from "./routes/users";
import { restoreSessionOnce } from "./features/auth/session-bootstrap";
import { authStore } from "./stores/auth-store";

const signInPath = "/sign-in" as const;

function hasAdminSession(): boolean {
  const { accessToken, user } = authStore.getState().sites[authStore.getState().activeSiteId];
  return (
    typeof accessToken === "string" &&
    accessToken.trim().length > 0 &&
    Boolean(user) &&
    isAdminUser(user)
  );
}

async function requireAdmin(): Promise<void> {
  if (hasAdminSession()) return;
  await restoreSessionOnce();
  if (!hasAdminSession()) {
    throw redirect({ to: signInPath });
  }
}

async function redirectAuthenticatedUser(): Promise<void> {
  if (hasAdminSession()) {
    throw redirect({ to: "/users" });
  }
  await restoreSessionOnce();
  if (hasAdminSession()) {
    throw redirect({ to: "/users" });
  }
}

const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: AppErrorFallback,
  notFoundComponent: AppNotFoundFallback,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/users" });
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: signInPath,
  beforeLoad: redirectAuthenticatedUser,
  component: SignInPage,
});

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stats",
  validateSearch: validateStatsSearch,
  beforeLoad: requireAdmin,
  component: StatsRoutePage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  validateSearch: validateUsersSearch,
  beforeLoad: requireAdmin,
  component: UsersPage,
});

const userDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$id",
  validateSearch: validateUsersSearch,
  beforeLoad: requireAdmin,
  component: UserDetailPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  statsRoute,
  usersRoute,
  userDetailRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: "/admin-h5",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
