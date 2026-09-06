import type { ReactElement } from "react";
import { useAuthStore } from "../stores/auth-store";
import { SignInPage as SignInFeaturePage } from "../features/auth/components/SignInPage";

export function SignInPage(): ReactElement {
  return <SignInFeaturePage />;
}

// This route module intentionally exports the navigation guard alongside its component.
// oxlint-disable-next-line react/only-export-components
export function canVisitSignIn(): boolean {
  const site = useAuthStore.getState().sites[useAuthStore.getState().activeSiteId];
  return site.accessToken === null;
}
