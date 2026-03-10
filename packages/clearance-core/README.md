# @clearance/core

SDK for validating agent permission scopes before execution.

## Installation

```
pnpm add @clearance/core
```

## Quick Start

```ts
import { createClearance } from '@clearance/core'

const clearance = createClearance({
  agent: '0xAgentAddress',
  permissions: {
    allowedContracts: ['0xUniswapV3Router'],
    allowedActions: ['swap'],
    spendLimit: { ETH: 1_000_000_000_000_000_000n }, // 1 ETH cumulative max
    expiry: 86400, // 24 hours in seconds
  },
})

// Pure check — no side effects, safe for dry-run previews
clearance.check({ action: 'swap', contract: '0xUniswapV3Router' }) // OK
clearance.check({ action: 'transfer', contract: '0xUniswap' })     // throws!

// Stateful validate — accumulates spend toward budget, use when committing actions
clearance.validate({
  action: 'swap',
  contract: '0xUniswapV3Router',
  spend: { token: 'ETH', amount: 500_000_000_000_000_000n }, // 0.5 ETH
})
```

## API

### `createClearance(options)`

Creates a permission-scoped clearance object.

```ts
createClearance({
  agent: string,           // agent identifier (address or name)
  permissions: {
    allowedContracts: string[],           // contract addresses (case-insensitive)
    allowedActions: string[],             // action names (case-sensitive)
    spendLimit: Record<string, bigint>,   // per-token cumulative spend limit (wei)
    expiry: number,                       // validity window in seconds
  },
})
```

### `check(call)` vs `validate(call)`

| Method | Side effects | Use when |
|--------|-------------|----------|
| `check(call)` | None — pure read-only | Dry-run previews, UI validation |
| `validate(call)` | Accumulates `spentAmounts` | Actually committing an agent action |

Both methods throw if the call violates any permission constraint.

### `AgentCall` shape

```ts
{
  action: string     // case-sensitive action name
  contract: string   // contract address (case-insensitive)
  spend?: {
    token: string    // token symbol or address (case-insensitive)
    amount: bigint   // amount in wei; must be >= 0n
  }
}
```

### `clearance.spentAmounts`

Read-only record of cumulative spend per token (keys are uppercased).
Updated by `validate()` calls. Useful for audit trails.

```ts
console.log(clearance.spentAmounts) // { ETH: 500000000000000000n }
```

### `clearance.isExpired()`

Returns `true` if `now >= createdAt + expiry * 1000ms`.
