import { describe, it, expect } from 'vitest'
import { createClearance } from './clearance'

describe('createClearance', () => {
  const baseOptions = {
    agent: '0xagent',
    permissions: {
      allowedContracts: ['0xUniswap'],
      allowedActions: ['swap'],
      spendLimit: { ETH: 1_000_000_000_000_000_000n }, // 1 ETH
      expiry: 86400, // 24h in seconds
    },
  } as const

  it('should create clearance with correct agent and permissions', () => {
    const clearance = createClearance(baseOptions)
    expect(clearance.agent).toBe('0xagent')
    expect(clearance.permissions.allowedContracts).toContain('0xUniswap')
    expect(clearance.permissions.allowedActions).toContain('swap')
    expect(clearance.permissions.spendLimit.ETH).toBe(1_000_000_000_000_000_000n)
    expect(clearance.permissions.expiry).toBe(86400)
  })

  it('should not throw for valid action and contract', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'swap', contract: '0xUniswap' })).not.toThrow()
  })

  it('should throw for action not in allowedActions', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'transfer', contract: '0xUniswap' })).toThrow(
      'Action "transfer" not in allowedActions'
    )
  })

  it('should throw for contract not in allowedContracts', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'swap', contract: '0xAave' })).toThrow(
      'Contract "0xAave" not in allowedContracts'
    )
  })

  it('should check action before contract (action error takes priority)', () => {
    const clearance = createClearance(baseOptions)
    expect(() => clearance.validate({ action: 'borrow', contract: '0xAave' })).toThrow(
      'Action "borrow" not in allowedActions'
    )
  })

  describe('case-insensitive contract matching', () => {
    it('should accept allowedContract with different casing', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({ action: 'swap', contract: '0XUNISWAP' })
      ).not.toThrow()
    })

    it('should accept lowercase version of allowed contract', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({ action: 'swap', contract: '0xuniswap' })
      ).not.toThrow()
    })
  })

  describe('spendLimit enforcement', () => {
    it('should pass when spend is within limit', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 500_000_000_000_000_000n }, // 0.5 ETH
        })
      ).not.toThrow()
    })

    it('should pass when spend equals the limit exactly', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 1_000_000_000_000_000_000n }, // exactly 1 ETH
        })
      ).not.toThrow()
    })

    it('should throw when spend exceeds the limit', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'ETH', amount: 2_000_000_000_000_000_000n }, // 2 ETH
        })
      ).toThrow('Spend of 2000000000000000000 for "ETH" exceeds limit 1000000000000000000')
    })

    it('should not restrict spend for tokens not in spendLimit', () => {
      const clearance = createClearance(baseOptions)
      expect(() =>
        clearance.validate({
          action: 'swap',
          contract: '0xUniswap',
          spend: { token: 'USDC', amount: 999_999_999n }, // USDC not in spendLimit
        })
      ).not.toThrow()
    })
  })

  describe('expiry', () => {
    it('should not be expired immediately after creation', () => {
      const clearance = createClearance(baseOptions)
      expect(clearance.isExpired()).toBe(false)
    })

    it('should be expired when expiry is 0 seconds', () => {
      let tick = 0
      const now = () => { tick++; return tick }
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 0 } },
        { now }
      )
      // createdAt = 1, now() = 2 on second call, 2 > 1 + 0 = true
      expect(clearance.isExpired()).toBe(true)
    })

    it('should not be expired when within expiry window', () => {
      const start = 1_000_000
      let calls = 0
      const now = () => { calls++; return calls === 1 ? start : start + 3600_000 } // 1 hour later
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 7200 } }, // 2h window
        { now }
      )
      expect(clearance.isExpired()).toBe(false) // 1h elapsed, 2h window — not expired
    })

    it('should be expired after expiry window passes', () => {
      const start = 1_000_000
      let calls = 0
      const now = () => { calls++; return calls === 1 ? start : start + 90_000_000 } // 25 hours later
      const clearance = createClearance(
        { ...baseOptions, permissions: { ...baseOptions.permissions, expiry: 86400 } }, // 24h window
        { now }
      )
      expect(clearance.isExpired()).toBe(true)
    })
  })

  it('should support multiple allowed contracts and actions', () => {
    const clearance = createClearance({
      agent: '0xagent',
      permissions: {
        allowedContracts: ['0xUniswap', '0xAave', '0xCurve'],
        allowedActions: ['swap', 'addLiquidity', 'borrow'],
        spendLimit: { ETH: 5_000_000_000_000_000_000n, USDC: 10_000n },
        expiry: 3600,
      },
    })
    expect(() => clearance.validate({ action: 'borrow', contract: '0xAave' })).not.toThrow()
    expect(() => clearance.validate({ action: 'addLiquidity', contract: '0xCurve' })).not.toThrow()
  })
})
