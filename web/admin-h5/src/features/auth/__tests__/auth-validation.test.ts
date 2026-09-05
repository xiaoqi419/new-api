import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAuthBundle, isTwoFactorChallenge, type AuthBundle } from "../types";

const now = 2_000_000_000;

function validBundle(): AuthBundle {
  return {
    access_token: "access-token",
    token_type: "Bearer",
    access_expires_at: now + 3_600,
    user: { id: 7, username: "admin", role: 10 },
    session: {
      sid: "session-1",
      current: true,
      login_method: "password",
      expires_at: now + 7_200,
    },
  };
}

function validChallenge() {
  return {
    require_2fa: true as const,
    flow_token: "flow-token",
    expires_at: now + 300,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trusted auth response validation", () => {
  it.each([
    ["missing user id", { username: "admin", role: 10 }],
    ["empty username", { id: 7, username: " ", role: 10 }],
  ])("rejects %s", (_name, user) => {
    expect(isAuthBundle({ ...validBundle(), user })).toBe(false);
  });

  it("rejects a non-Bearer token type", () => {
    expect(isAuthBundle({ ...validBundle(), token_type: "bearer" })).toBe(false);
  });

  it.each([
    ["expired access expiry", { access_expires_at: now }],
    ["non-finite access expiry", { access_expires_at: Number.NaN }],
    ["expired session expiry", { session: { ...validBundle().session, expires_at: now } }],
    [
      "non-finite session expiry",
      { session: { ...validBundle().session, expires_at: Number.POSITIVE_INFINITY } },
    ],
  ])("rejects %s", (_name, changes) => {
    expect(isAuthBundle({ ...validBundle(), ...changes })).toBe(false);
  });

  it("accepts a complete future auth bundle", () => {
    expect(isAuthBundle(validBundle())).toBe(true);
  });
});

describe("two-factor challenge validation", () => {
  it("rejects a missing flow token", () => {
    const { flow_token: _flowToken, ...challenge } = validChallenge();
    expect(isTwoFactorChallenge(challenge)).toBe(false);
  });

  it.each([
    ["expired", now],
    ["non-finite", Number.NaN],
  ])("rejects a %s challenge", (_name, expires_at) => {
    expect(isTwoFactorChallenge({ ...validChallenge(), expires_at })).toBe(false);
  });

  it("accepts a complete future challenge", () => {
    expect(isTwoFactorChallenge(validChallenge())).toBe(true);
  });
});
