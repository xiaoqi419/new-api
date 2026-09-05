import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";

import { isAdminUser } from "./features/auth/types";
import { AppErrorFallback, AppNotFoundFallback, RootLayout } from "./routes/__root";
import { SignInPage } from "./routes/sign-in";
import { UserDetailPage } from "./routes/users.$id";
import { validateUsersSearch, UsersPage } from "./routes/users";
import { authStore } from "./stores/auth-store";

const signInPath = "/sign-in" as const;

function requireAdmin(): void {
  const { accessToken, user } = authStore.getState().sites[authStore.getState().activeSiteId];
  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length === 0 ||
    !user ||
    !isAdminUser(user)
  ) {
    throw redirect({ to: signInPath });
  }
}

function redirectAuthenticatedUser(): void {
  const { accessToken, user } = authStore.getState().sites[authStore.getState().activeSiteId];
  if (
    typeof accessToken === "string" &&
    accessToken.trim().length > 0 &&
    user &&
    isAdminUser(user)
  ) {
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

const routeTree = rootRoute.addChildren([indexRoute, signInRoute, usersRoute, userDetailRoute]);

export const router = createRouter({
  routeTree,
  basepath: "/admin-h5",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
