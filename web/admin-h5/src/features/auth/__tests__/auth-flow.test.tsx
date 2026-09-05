import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../i18n";
import { authStore } from "../../../stores/auth-store";
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

const bundle = (role: string | number) => ({
  access_token: "test-token",
  token_type: "Bearer",
  access_expires_at: 1_900_000_000,
  user: { id: 1, username: "admin", role },
  session: { sid: "session", current: true, login_method: "password", expires_at: 1_900_100_000 },
});

function fillLogin(): void {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-a-real-password" } });
}

async function startTwoFactor(): Promise<HTMLElement> {
  mocks.signIn.mockResolvedValue({
    success: true,
    message: "",
    data: { require_2fa: true, flow_token: "flow-token", expires_at: 1_900_000_000 },
  });
  render(<SignInPage />);
  fillLogin();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  return screen.findByLabelText("Verification code");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authStore.getState().reset();
});

describe("admin sign-in flow", () => {
  it("renders accessible username and password labels", () => {
    render(<SignInPage />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("navigates after a successful admin login", async () => {
    mocks.signIn.mockResolvedValue({ success: true, message: "", data: bundle(10) });
    render(<SignInPage />);
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/users", replace: true }),
    );
  });

  it("replaces the form with a 2FA code form and submits its flow token", async () => {
    const codeInput = await startTwoFactor();
    mocks.verifyTwoFactor.mockResolvedValue({ success: true, message: "", data: bundle(10) });
    expect(codeInput).toHaveAttribute("maxLength", "8");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() =>
      expect(mocks.verifyTwoFactor).toHaveBeenCalledWith({
        flow_token: "flow-token",
        code: "123456",
      }),
    );
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/users", replace: true }),
    );
  });

  it("rejects a 2FA code shorter than six characters", async () => {
    const codeInput = await startTwoFactor();
    fireEvent.change(codeInput, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(mocks.verifyTwoFactor).not.toHaveBeenCalled();
  });

  it("rejects a 2FA code longer than eight characters", async () => {
    const codeInput = await startTwoFactor();
    fireEvent.change(codeInput, { target: { value: "123456789" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(mocks.verifyTwoFactor).not.toHaveBeenCalled();
  });

  it("logs out a non-admin session before showing the permission error", async () => {
    mocks.signOut.mockResolvedValue({ success: true, message: "", data: null });
    mocks.signIn.mockResolvedValue({ success: true, message: "", data: bundle(9) });
    render(<SignInPage />);
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
    expect(mocks.signOut).toHaveBeenCalledWith("session");
    expect(mocks.reset).toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps the permission error when non-admin logout fails", async () => {
    mocks.signOut.mockRejectedValue(new Error("logout unavailable"));
    mocks.signIn.mockResolvedValue({ success: true, message: "", data: bundle(9) });
    render(<SignInPage />);
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
    expect(mocks.reset).toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("disables submit while the login request is pending", async () => {
    let resolveLogin!: (value: unknown) => void;
    mocks.signIn.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    render(<SignInPage />);
    fillLogin();
    const submit = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    resolveLogin({ success: false, message: "Invalid credentials" });
    await waitFor(() => expect(submit).not.toBeDisabled());
  });
});
