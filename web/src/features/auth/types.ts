/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { AuthBundle } from '@/stores/auth-store'

// ============================================================================
// API Payloads
// ============================================================================

export interface LoginPayload {
  username: string
  password: string
  turnstile?: string
  passwordEncryptionEnabled?: boolean
  captcha?: CaptchaQuery
}

export interface TwoFAPayload {
  code: string
  flow_token: string
}

export interface RegisterPayload {
  username: string
  password: string
  email?: string
  verification_code?: string
  aff_code?: string
  turnstile?: string
  captcha?: CaptchaQuery
}

export interface PasswordResetPayload {
  email: string
  turnstile?: string
}

export interface EmailVerificationPayload {
  email: string
  turnstile?: string
}

export interface BindEmailPayload {
  email: string
  code: string
}

// ============================================================================
// API Responses
// ============================================================================

export interface LoginResponse {
  success: boolean
  message: string
  data?:
    | AuthBundle
    | {
        require_2fa?: boolean
        flow_token?: string
        expires_at?: number
      }
}

export interface Login2FAResponse {
  success: boolean
  message: string
  data?: AuthBundle
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data?: T
}

// ============================================================================
// WeChat Official Account verification
// ============================================================================

export interface WeChatMpCode {
  code: string
  /**
   * Opaque handle the browser polls with. Kept separate from `code` because
   * `code` is only six digits and is meant to be typed into WeChat by hand;
   * polling on it would let anyone brute-force their way into a session.
   */
  token: string
  qrcode: string
  /** Code lifetime in seconds. */
  expire: number
}

/**
 * Poll payload while the user has not replied yet. Once the Official Account
 * receives the code, the same endpoint answers with the login bundle (sign-in),
 * `{ status: 'bound' }` (account binding), or `{ status: 'unbound' }` when the
 * openid belongs to nobody yet and the user still has to pick what to do.
 */
export interface WeChatMpPendingStatus {
  status: 'pending' | 'expired' | 'bound' | 'unbound'
  /** Only present on `unbound`: whether new sign-ups are allowed at all. */
  register_enabled?: boolean
}

// ============================================================================
// System Status
// ============================================================================

export interface SystemStatus {
  success?: boolean
  message?: string
  data?: {
    version?: string
    system_name?: string
    logo?: string
    login_page_config?: string
    promo_banner_config?: string
    github_oauth?: boolean
    github_client_id?: string
    discord_oauth?: boolean
    discord_client_id?: string
    oidc_enabled?: boolean
    oidc_authorization_endpoint?: string
    oidc_client_id?: string
    oidc_display_name?: string
    linuxdo_oauth?: boolean
    linuxdo_client_id?: string
    telegram_oauth?: boolean
    telegram_bot_name?: string
    passkey_login?: boolean
    wechat_login?: boolean
    wechat_mp?: boolean
    wechat_qrcode?: string
    wechat_qr_code?: string
    wechat_qrcode_image_url?: string
    wechat_qr_code_image_url?: string
    wechat_account_qrcode_image_url?: string
    WeChatAccountQRCodeImageURL?: string
    turnstile_check?: boolean
    click_captcha_enabled?: boolean
    turnstile_site_key?: string
    email_verification?: boolean
    self_use_mode_enabled?: boolean
    display_in_currency?: boolean
    display_token_stat_enabled?: boolean
    quota_per_unit?: number
    quota_display_type?: string
    usd_exchange_rate?: number
    custom_currency_symbol?: string
    custom_currency_exchange_rate?: number
    demo_site_enabled?: boolean
    user_agreement_enabled?: boolean
    privacy_policy_enabled?: boolean
    legal_version?: string
    community_links?: string
    oauth_register_enabled?: boolean
    register_enabled?: boolean
    password_login_enabled?: boolean
    password_login_encryption_enabled?: boolean
    password_register_enabled?: boolean
    custom_oauth_providers?: CustomOAuthProviderInfo[]
    [key: string]: unknown
  }
  // Allow direct access to common properties
  version?: string
  system_name?: string
  logo?: string
  login_page_config?: string
  promo_banner_config?: string
  github_oauth?: boolean
  github_client_id?: string
  discord_oauth?: boolean
  discord_client_id?: string
  oidc_enabled?: boolean
  oidc_authorization_endpoint?: string
  oidc_client_id?: string
  oidc_display_name?: string
  linuxdo_oauth?: boolean
  linuxdo_client_id?: string
  telegram_oauth?: boolean
  telegram_bot_name?: string
  passkey_login?: boolean
  wechat_login?: boolean
  wechat_mp?: boolean
  wechat_qrcode?: string
  wechat_qr_code?: string
  wechat_qrcode_image_url?: string
  wechat_qr_code_image_url?: string
  wechat_account_qrcode_image_url?: string
  WeChatAccountQRCodeImageURL?: string
  turnstile_check?: boolean
  click_captcha_enabled?: boolean
  turnstile_site_key?: string
  email_verification?: boolean
  self_use_mode_enabled?: boolean
  display_in_currency?: boolean
  display_token_stat_enabled?: boolean
  quota_per_unit?: number
  quota_display_type?: string
  usd_exchange_rate?: number
  custom_currency_symbol?: string
  custom_currency_exchange_rate?: number
  demo_site_enabled?: boolean
  user_agreement_enabled?: boolean
  privacy_policy_enabled?: boolean
  legal_version?: string
  community_links?: string
  oauth_register_enabled?: boolean
  register_enabled?: boolean
  password_login_enabled?: boolean
  password_login_encryption_enabled?: boolean
  password_register_enabled?: boolean
  default_theme_preset?: string
  custom_oauth_providers?: CustomOAuthProviderInfo[]
  [key: string]: unknown
}

// ============================================================================
// OAuth
// ============================================================================

export interface OAuthProvider {
  name: string
  type: 'github' | 'discord' | 'oidc' | 'linuxdo' | 'telegram' | 'wechat'
  enabled: boolean
  clientId?: string
  authEndpoint?: string
}

export interface CustomOAuthProviderInfo {
  id: number
  name: string
  slug: string
  icon: string
  client_id: string
  authorization_endpoint: string
  scopes: string
}

// ============================================================================
// Form Props
// ============================================================================

export interface AuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

/** A solved click captcha: the challenge id plus flat "x,y,x,y,x,y" click positions. */
export interface ClickCaptchaSolution {
  id: string
  points: string
}

export interface ClickCaptchaChallenge {
  id: string
  image: string
  targets: string[]
  width: number
  height: number
}

export interface CaptchaQuery {
  captcha_id?: string
  captcha_points?: string
}
