export interface AuthUser {
  id: number;
  username: string;
  display_name?: string;
  email?: string;
  role?: string | number;
  status?: number;
  quota?: number;
  used_quota?: number;
  [key: string]: unknown;
}

export interface LoginSession {
  sid: string;
  current: boolean;
  login_method: string;
  expires_at: number;
}

export interface AuthBundle {
  access_token: string;
  token_type: string;
  access_expires_at: number;
  user: AuthUser;
  session: LoginSession;
}

export interface TwoFactorChallenge {
  require_2fa: true;
  flow_token: string;
  expires_at: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  code?: string | number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TwoFactorLoginRequest {
  flow_token: string;
  code: string;
}

export const ROLE_ADMIN_USER = 10;

export function isAdminUser(user: AuthUser): boolean {
  return (
    typeof user.role === "number" && Number.isFinite(user.role) && user.role >= ROLE_ADMIN_USER
  );
}

function isFutureTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value > Math.floor(Date.now() / 1000)
  );
}

export function isAuthBundle(value: unknown): value is AuthBundle {
  if (typeof value !== "object" || value === null) return false;
  const bundle = value as Partial<AuthBundle>;
  if (
    typeof bundle.access_token !== "string" ||
    bundle.access_token.trim().length === 0 ||
    bundle.token_type !== "Bearer" ||
    !isFutureTimestamp(bundle.access_expires_at) ||
    typeof bundle.user !== "object" ||
    bundle.user === null ||
    typeof bundle.session !== "object" ||
    bundle.session === null
  ) {
    return false;
  }

  const user = bundle.user as Partial<AuthUser>;
  if (
    typeof user.id !== "number" ||
    !Number.isFinite(user.id) ||
    user.id <= 0 ||
    typeof user.username !== "string" ||
    user.username.trim().length === 0 ||
    !isAdminUser(user as AuthUser)
  ) {
    return false;
  }

  const session = bundle.session as Partial<LoginSession>;
  return (
    typeof session.sid === "string" &&
    session.sid.trim().length > 0 &&
    typeof session.current === "boolean" &&
    typeof session.login_method === "string" &&
    session.login_method.trim().length > 0 &&
    isFutureTimestamp(session.expires_at)
  );
}

export function isTwoFactorChallenge(value: unknown): value is TwoFactorChallenge {
  if (typeof value !== "object" || value === null) return false;
  const challenge = value as Partial<TwoFactorChallenge>;
  return (
    challenge.require_2fa === true &&
    typeof challenge.flow_token === "string" &&
    challenge.flow_token.trim().length > 0 &&
    isFutureTimestamp(challenge.expires_at)
  );
}
