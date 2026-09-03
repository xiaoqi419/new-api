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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, test, vi } from 'vitest'

import {
  DEFAULT_GMPAY_FEE_CONFIG_JSON,
  GMPayFeeConfigEditor,
  getGMPayFeeConfigError,
  getGMPayTransactionContextError,
  parseGMPayFeeConfig,
  serializeGMPayFeeConfig,
} from '../gmpay-fee-config'

describe('GMPay fee fallback configuration', () => {
  test('accepts the safe default and keeps the fallback disabled', () => {
    expect(getGMPayFeeConfigError(DEFAULT_GMPAY_FEE_CONFIG_JSON)).toBeNull()
    expect(JSON.parse(DEFAULT_GMPAY_FEE_CONFIG_JSON)).not.toHaveProperty(
      'dynamic_enabled'
    )
    expect(parseGMPayFeeConfig(DEFAULT_GMPAY_FEE_CONFIG_JSON)).toMatchObject({
      version: 1,
      enabled: false,
      default: { mode: 'fixed', value: '0.00' },
      max_fee: '20.00',
      max_total: '100000.00',
    })
  })

  test('allows an empty value as an explicit disabled fallback', () => {
    expect(getGMPayFeeConfigError('')).toBeNull()
    expect(parseGMPayFeeConfig('')).toMatchObject({
      version: 1,
      enabled: false,
    })
  })

  test('rejects unsupported modes and out-of-range percentages', () => {
    const unsupportedMode = JSON.stringify({
      version: 1,
      default: { mode: 'tiered', value: '1.00' },
    })
    expect(getGMPayFeeConfigError(unsupportedMode)).toBe(
      'GMPay fee mode must be fixed or percent'
    )

    const excessivePercent = JSON.stringify({
      version: 1,
      default: { mode: 'percent', value: '100.01' },
    })
    expect(getGMPayFeeConfigError(excessivePercent)).toBe(
      'GMPay percentage fee must be between 0 and 100'
    )
  })

  test('validates stablecoin override keys and decimal precision', () => {
    const invalidKey = JSON.stringify({
      version: 1,
      overrides: {
        'TRX:tron': { mode: 'fixed', value: '1.00' },
      },
    })
    expect(getGMPayFeeConfigError(invalidKey)).toBe(
      'GMPay fee override key must use TOKEN:network format'
    )

    const excessivePrecision = JSON.stringify({
      version: 1,
      default: { mode: 'fixed', value: '1.1234567' },
    })
    expect(getGMPayFeeConfigError(excessivePrecision)).toBe(
      'GMPay fee value must be a non-negative decimal with up to 6 decimal places'
    )
  })

  test('normalizes omitted optional fields to safe defaults', () => {
    const parsed = parseGMPayFeeConfig(
      JSON.stringify({
        version: 1,
        enabled: true,
        overrides: {
          'usdc:ethereum': { mode: 'percent', value: '1.50' },
        },
      })
    )

    expect(parsed).toMatchObject({
      version: 1,
      enabled: true,
      dynamic_enabled: false,
      estimator_mode: 'auto',
      default: { mode: 'fixed', value: '0.00' },
      overrides: {
        'usdc:ethereum': { mode: 'percent', value: '1.50' },
      },
      max_fee: '20.00',
      max_total: '100000.00',
    })
  })

  test('serializes endpoint URLs and transaction context into canonical chains', () => {
    const parsed = parseGMPayFeeConfig(
      JSON.stringify({
        version: 1,
        dynamic_enabled: true,
        rpc_references: {
          ethereum: 'https://rpc.example.test/json-rpc',
        },
        price_source_references: {
          ethereum: 'https://prices.example.test/native/eth',
        },
        request_timeout_ms: 2500,
        cache_ttl_seconds: 15,
        quote_ttl_seconds: 90,
        response_body_limit_bytes: 65536,
        max_retries: 1,
        price_max_age_seconds: 45,
        max_price_deviation_percent: '10.00',
        contexts: {
          ethereum: {
            from: '0x1111111111111111111111111111111111111111',
            to: '0x2222222222222222222222222222222222222222',
            token_contract: '0x3333333333333333333333333333333333333333',
            calldata: '0xa9059cbb',
          },
        },
      })
    )

    expect(parsed).not.toBeNull()
    if (!parsed) throw new Error('expected parsed GMPay fee configuration')
    const serialized = JSON.parse(serializeGMPayFeeConfig(parsed))
    expect(serialized).toMatchObject({
      chains: {
        ethereum: {
          rpc_url: 'https://rpc.example.test/json-rpc',
          price_url: 'https://prices.example.test/native/eth',
          native_asset: 'ETH',
          settlement_currency: 'USD',
          rpc_allowed_hosts: ['rpc.example.test'],
          price_allowed_hosts: ['prices.example.test'],
          transaction: {
            from: '0x1111111111111111111111111111111111111111',
            to: '0x2222222222222222222222222222222222222222',
            token_contract: '0x3333333333333333333333333333333333333333',
            calldata: '0xa9059cbb',
          },
        },
      },
      dynamic_enabled: true,
      timeout_ms: 2500,
      max_response_bytes: 65536,
      quote_ttl_seconds: 90,
      price_max_age_seconds: 45,
      request_timeout_ms: 2500,
      response_body_limit_bytes: 65536,
    })
    expect(getGMPayFeeConfigError(JSON.stringify(serialized))).toBeNull()
  })

  test('preserves multiple canonical price sources while keeping the legacy first URL', () => {
    const first = 'https://prices-one.example.test/native/eth'
    const second = 'https://prices-two.example.test/native/eth'
    const value = JSON.stringify({
      version: 1,
      dynamic_enabled: true,
      chains: {
        ethereum: {
          rpc_url: 'https://rpc.example.test/json-rpc',
          price_url: first,
          price_urls: [first, second],
          native_asset: 'ETH',
          settlement_currency: 'USD',
          rpc_allowed_hosts: ['rpc.example.test'],
          price_allowed_hosts: [
            'prices-one.example.test',
            'prices-two.example.test',
          ],
          transaction: {},
        },
      },
    })

    expect(getGMPayFeeConfigError(value)).toBeNull()
    const parsed = parseGMPayFeeConfig(value)
    expect(parsed).not.toBeNull()
    if (!parsed) throw new Error('expected parsed multi-source config')
    expect(parsed.price_source_references.ethereum).toBe(first)
    expect(parsed.price_source_lists.ethereum).toEqual([first, second])

    const serialized = JSON.parse(serializeGMPayFeeConfig(parsed))
    expect(serialized.price_source_references.ethereum).toBe(first)
    expect(serialized.chains.ethereum.price_url).toBe(first)
    expect(serialized.chains.ethereum.price_urls).toEqual([first, second])
    expect(getGMPayFeeConfigError(JSON.stringify(serialized))).toBeNull()
  })

  test('rejects more than eight canonical price sources', () => {
    const sources = Array.from(
      { length: 9 },
      (_, index) => `https://prices-${index}.example.test/native/eth`
    )
    expect(
      getGMPayFeeConfigError(
        JSON.stringify({
          version: 1,
          chains: {
            ethereum: {
              rpc_url: 'https://rpc.example.test/json-rpc',
              price_urls: sources,
              native_asset: 'ETH',
              settlement_currency: 'USD',
              transaction: {},
            },
          },
        })
      )
    ).toBe('GMPay chain price_urls must contain between 1 and 8 sources')
  })

  test('reads canonical Solana context fields into the structured draft', () => {
    const parsed = parseGMPayFeeConfig(
      JSON.stringify({
        version: 1,
        chains: {
          solana: {
            rpc_url: 'https://rpc.example.test',
            price_url: 'https://prices.example.test',
            native_asset: 'SOL',
            settlement_currency: 'USD',
            rpc_allowed_hosts: ['rpc.example.test'],
            price_allowed_hosts: ['prices.example.test'],
            transaction: {
              payer: 'payer-account',
              to: 'recipient-account',
              token_mint: 'mint-account',
              message: 'AQID',
            },
          },
        },
        timeout_ms: 5000,
        max_response_bytes: 65536,
        quote_ttl_seconds: 300,
        price_max_age_seconds: 120,
      })
    )

    expect(parsed).toMatchObject({
      rpc_references: { solana: 'https://rpc.example.test' },
      price_source_references: { solana: 'https://prices.example.test' },
      price_max_age_seconds: 120,
      rpc_allowed_hosts: { solana: ['rpc.example.test'] },
      price_allowed_hosts: { solana: ['prices.example.test'] },
      contexts: {
        solana: {
          payer: 'payer-account',
          to: 'recipient-account',
          token_mint: 'mint-account',
          mint: 'mint-account',
          message: 'AQID',
        },
      },
    })
  })

  test('rejects dynamic estimation when a network has only one endpoint', () => {
    expect(
      getGMPayFeeConfigError(
        JSON.stringify({
          version: 1,
          dynamic_enabled: true,
          rpc_references: {
            ethereum: 'https://rpc.example.test',
          },
        })
      )
    ).toBe(
      'GMPay dynamic fee configuration requires both RPC and price references for each configured network'
    )
  })

  test('requires and round-trips the TRON function selector for token transfers', () => {
    const missingSelector = JSON.stringify({
      version: 1,
      contexts: {
        tron: {
          from: 'TFrom',
          to: 'TRecipient',
          token_contract: 'TContract',
          calldata: '00000000',
        },
      },
    })
    expect(getGMPayFeeConfigError(missingSelector)).toBe(
      'GMPay TRON token transfer context requires sender, recipient, token contract, calldata, and function selector'
    )

    const invalidSelector = JSON.stringify({
      version: 1,
      contexts: {
        tron: {
          from: 'TFrom',
          to: 'TRecipient',
          token_contract: 'TContract',
          calldata: '00000000',
          function_selector: 'a9059cbb',
        },
      },
    })
    expect(getGMPayFeeConfigError(invalidSelector)).toBe(
      'GMPay TRON function selector must use a valid signature such as transfer(address,uint256)'
    )

    const parsed = parseGMPayFeeConfig(
      JSON.stringify({
        version: 1,
        contexts: {
          tron: {
            from: 'TFrom',
            to: 'TRecipient',
            token_contract: 'TContract',
            calldata: '00000000',
            function_selector: 'transfer(address,uint256)',
          },
        },
      })
    )
    expect(parsed).not.toBeNull()
    if (!parsed) throw new Error('expected parsed TRON context')
    const serialized = JSON.parse(serializeGMPayFeeConfig(parsed))
    expect(serialized.contexts.tron.function_selector).toBe(
      'transfer(address,uint256)'
    )
    expect(serialized.chains).toEqual({})
  })

  test('rejects a Solana message-only context in dynamic mode', () => {
    const value = JSON.stringify({
      version: 1,
      dynamic_enabled: true,
      rpc_references: { solana: 'https://rpc.example.test' },
      price_source_references: { solana: 'https://prices.example.test' },
      contexts: {
        solana: {
          payer: 'payer-account',
          to: 'recipient-account',
          token_mint: 'mint-account',
          message: 'AQID',
        },
      },
    })
    expect(getGMPayFeeConfigError(value)).toBe(
      'GMPay Solana legacy message requires structured transfer fields so the message can be verified'
    )
  })

  test('round-trips the controlled Solana transfer context and keeps legacy message optional', () => {
    const context = {
      payer: 'payer-account',
      source_token_account: 'source-token-account',
      recipient_token_account: 'recipient-token-account',
      token_mint: 'mint-account',
      transfer_instruction: 'transferChecked',
      transfer_amount_base_units: '1000000',
      token_decimals: 6,
      recent_blockhash: 'recent-blockhash',
      token_program_id: 'token-program-id',
      message: 'AQID',
    }
    const value = JSON.stringify({
      version: 1,
      dynamic_enabled: true,
      rpc_references: { solana: 'https://rpc.example.test' },
      price_source_references: { solana: 'https://prices.example.test' },
      contexts: { solana: context },
    })
    expect(getGMPayFeeConfigError(value)).toBeNull()
    const parsed = parseGMPayFeeConfig(value)
    expect(parsed).not.toBeNull()
    if (!parsed) throw new Error('expected parsed Solana context')
    const serialized = JSON.parse(serializeGMPayFeeConfig(parsed))
    expect(serialized.contexts.solana).toMatchObject(context)
    expect(serialized.chains.solana.transaction).toMatchObject(context)
    expect(
      getGMPayTransactionContextError('solana', context, {
        requireStructured: true,
      })
    ).toBeNull()
  })

  test('does not render saved RPC and transaction values in the admin editor', () => {
    const value = JSON.stringify({
      version: 1,
      rpc_references: { tron: 'https://rpc.example.test/key=secret' },
      price_source_references: { tron: 'https://prices.example.test' },
      contexts: {
        tron: {
          from: 'TFrom',
          to: 'TRecipient',
          token_contract: 'TContract',
          calldata: 'deadbeef',
          function_selector: 'transfer(address,uint256)',
        },
      },
    })
    render(
      React.createElement(GMPayFeeConfigEditor, {
        value,
        onChange: () => undefined,
      })
    )

    expect(screen.queryByLabelText('RPC endpoint URL')).toBeNull()
    expect(screen.queryByLabelText('Price source URL')).toBeNull()
    expect(screen.queryByDisplayValue('deadbeef')).toBeNull()
    expect(screen.getByText('Automatic GMPay network fee discovery')).toBeInTheDocument()
  })

  test('renders server discovery status with supported networks and sanitized estimate', async () => {
    const onTestEstimate = vi.fn().mockResolvedValue({
      state: 'ready',
      networks: [
        { network: 'tron', tokens: ['USDT'] },
        { network: 'ethereum', tokens: ['USDT', 'USDC'] },
      ],
      lastSyncedAt: '2026-09-02T08:00:00.000Z',
      lastEstimate: {
        network: 'ethereum',
        token: 'USDT',
        source: 'chain_network_estimate',
        feeAmount: '0.12 USD',
        nativeAmount: '0.00004 ETH',
        nativeAsset: 'ETH',
        settlementCurrency: 'USD',
        quotedAt: '2026-09-02T08:01:00.000Z',
        expiresAt: '2026-09-02T08:06:00.000Z',
      },
    })

    render(
      React.createElement(GMPayFeeConfigEditor, {
        value: DEFAULT_GMPAY_FEE_CONFIG_JSON,
        onChange: () => undefined,
        discoveryStatus: {
          state: 'ready',
          networks: [{ network: 'tron', tokens: ['USDT'] }],
          lastSyncedAt: '2026-09-02T08:00:00.000Z',
          lastSuccessAt: '2026-09-02T08:00:00.000Z',
        },
        onTestEstimate,
      })
    )

    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('TRON quote strategy')).toBeInTheDocument()
    expect(screen.getByText(/\(USDT\)/)).toBeInTheDocument()
    expect(screen.getByText('Last successful estimate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test estimate' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Test estimate' }))
    await waitFor(() => expect(onTestEstimate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Latest test estimate')).toBeInTheDocument())
    expect(screen.getByText('0.12 USD')).toBeInTheDocument()
    expect(
      screen.getByText('Fee source: Dynamic network fee estimate')
    ).toBeInTheDocument()
    expect(screen.queryByText('https://rpc.example.test')).toBeNull()
  })

  test('renders the reported fee source and unavailable administrator fallback', () => {
    render(
      React.createElement(GMPayFeeConfigEditor, {
        value: DEFAULT_GMPAY_FEE_CONFIG_JSON,
        onChange: () => undefined,
        discoveryStatus: {
          state: 'ready',
          feeSource: 'admin_fixed',
          fallbackEnabled: true,
          fallbackReady: false,
        },
      })
    )

    expect(
      screen.getByText('Fee source: Administrator fallback')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Administrator fallback: Unavailable')
    ).toBeInTheDocument()
  })

  test('surfaces the server error for a failed test estimate', async () => {
    const onTestEstimate = vi
      .fn()
      .mockRejectedValue(new Error('gateway unavailable'))

    render(
      React.createElement(GMPayFeeConfigEditor, {
        value: DEFAULT_GMPAY_FEE_CONFIG_JSON,
        onChange: () => undefined,
        onTestEstimate,
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Test estimate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'gateway unavailable'
    )
    expect(screen.queryByLabelText('RPC endpoint URL')).toBeNull()
    expect(screen.queryByLabelText('Price source URL')).toBeNull()
  })

  test('defaults TRON quote mode and rejects unknown values', () => {
    expect(parseGMPayFeeConfig(DEFAULT_GMPAY_FEE_CONFIG_JSON)).toMatchObject({
      tron_quote_mode: 'simulate_then_empirical',
    })
    expect(JSON.parse(DEFAULT_GMPAY_FEE_CONFIG_JSON)).not.toHaveProperty(
      'tron_quote_mode'
    )
    expect(
      getGMPayFeeConfigError(
        JSON.stringify({ version: 1, tron_quote_mode: 'guess' })
      )
    ).toBe('GMPay TRON quote mode is invalid')
    const empirical = JSON.stringify({
      version: 1,
      tron_quote_mode: 'empirical',
    })
    expect(getGMPayFeeConfigError(empirical)).toBeNull()
    expect(parseGMPayFeeConfig(empirical).tron_quote_mode).toBe('empirical')
    expect(
      JSON.parse(
        serializeGMPayFeeConfig(parseGMPayFeeConfig(empirical))
      ).tron_quote_mode
    ).toBe('empirical')
  })

  test('shows a translated fallback mode and a percent suffix', () => {
    const value = JSON.stringify({
      version: 1,
      fallback_enabled: true,
      fallback_mode: 'percent',
      fallback_value: '4.00',
      default: { mode: 'percent', value: '4.00' },
    })
    render(
      React.createElement(GMPayFeeConfigEditor, {
        value,
        onChange: () => undefined,
      })
    )
    expect(screen.getByLabelText('Fallback rule type')).toHaveTextContent(
      'Percentage of top-up'
    )
    expect(screen.queryByLabelText('Fallback rule type')).not.toHaveTextContent(
      'percent'
    )
    expect(screen.getByLabelText('Fallback percentage (%)')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Percentage of the top-up amount, from 0 to 100, capped by maximum fee and total.'
      )
    ).toBeInTheDocument()
  })

  test('requires the version marker used by the backend schema', () => {
    expect(
      getGMPayFeeConfigError(
        JSON.stringify({
          enabled: true,
          default: { mode: 'fixed', value: '1.00' },
        })
      )
    ).toBe('GMPay fee configuration version must be 1')
  })
})
