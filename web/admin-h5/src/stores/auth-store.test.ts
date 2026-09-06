import { afterEach, describe, expect, it } from 'vitest'

import { authStore } from './auth-store'

const adminBundle = {
  access_token: 'test-token',
  token_type: 'Bearer',
  access_expires_at: 1_900_000_000,
  user: { id: 1, username: 'admin', role: 10 },
  session: {
    sid: 'test-session',
    current: true,
    login_method: 'password',
    expires_at: 1_900_100_000,
  },
}

afterEach(() => {
  authStore.getState().reset('domestic')
  authStore.getState().reset('international')
  localStorage.removeItem('admin-h5.active-site')
  authStore.getState().setActiveSite('domestic')
})

describe('site authentication state', () => {
  it('requires signing out before switching away from an authenticated site', () => {
    authStore.getState().installBundle(adminBundle, 'domestic')

    authStore.getState().setActiveSite('international')
    expect(authStore.getState().activeSiteId).toBe('domestic')

    authStore.getState().reset('domestic')
    authStore.getState().setActiveSite('international')
    expect(authStore.getState().activeSiteId).toBe('international')
  })

  it('remembers the last selected site in localStorage', () => {
    authStore.getState().setActiveSite('international')
    expect(localStorage.getItem('admin-h5.active-site')).toBe('international')
  })
})
