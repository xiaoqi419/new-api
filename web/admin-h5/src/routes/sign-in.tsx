import type { ReactElement } from "react";
import { useAuthStore } from "../stores/auth-store";
import { SignInPage as SignInFeaturePage } from "../features/auth/components/SignInPage";

export function SignInPage(): ReactElement {
  return <SignInFeaturePage />;
}

export function canVisitSignIn(): boolean {
  const site = useAuthStore.getState().sites[useAuthStore.getState().activeSiteId];
  return site.accessToken === null;
}
