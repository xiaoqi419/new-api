import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../i18n";
import { SignInPage } from "../components/SignInPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn().mockResolvedValue(undefined),
  signIn: vi.fn(),
  verifyTwoFactor: vi.fn(),
  signOut: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    signIn: mocks.signIn,
    verifyTwoFactor: mocks.verifyTwoFactor,
    signOut: mocks.signOut,
    reset: mocks.reset,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("sign-in response validation", () => {
  it("does not enter 2FA for a failed response with challenge-shaped data", async () => {
    mocks.signIn.mockResolvedValue({
      success: false,
      message: "Invalid credentials",
      data: {
        require_2fa: true,
        flow_token: "flow-token",
        expires_at: Math.floor(Date.now() / 1_000) + 300,
      },
    });
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials"));
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
