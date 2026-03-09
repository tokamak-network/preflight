/**
 * Clearance — permission-scoped execution guard for AI agents.
 *
 * Like a security badge with a time limit:
 * the agent can only call specific contracts, run specific actions,
 * and spend up to a defined token limit — all within an expiry window.
 */

/**
 * Defines what an agent is permitted to do:
 * which contracts, which actions, how much to spend, and for how long.
 */
export interface Permissions {
  /** List of contract addresses the agent may call (case-insensitive comparison) */
  readonly allowedContracts: readonly string[]
  /** List of action names (e.g. 'swap', 'addLiquidity') the agent may execute */
  readonly allowedActions: readonly string[]
  /**
   * Per-token spend limits (bigint wei amounts).
   * If a token key is present, spend of that token must not exceed its value.
   * Tokens not listed in spendLimit are unconstrained.
   */
  readonly spendLimit: Readonly<Record<string, bigint>>
  /** How long (in seconds) this clearance is valid after creation */
  readonly expiry: number
}

/** Options passed to `createClearance` */
export interface ClearanceOptions {
  /** The agent's identifier (address or name) */
  readonly agent: string
  /** Permission scope for this clearance */
  readonly permissions: Permissions
}

/**
 * A proposed agent call to be validated.
 * All fields are checked against the clearance permissions.
 */
export interface AgentCall {
  /** The action name being attempted (case-sensitive) */
  readonly action: string
  /** The contract address being called (case-insensitive comparison) */
  readonly contract: string
  /**
   * Optional token spend to validate against spendLimit.
   * If provided and the token has a limit, throws when amount exceeds it.
   */
  readonly spend?: {
    /** Token symbol or address */
    readonly token: string
    /** Amount in wei (bigint) */
    readonly amount: bigint
  }
}

/**
 * A live clearance object with permission enforcement and expiry checking.
 *
 * Created by `createClearance`. Use `validate()` before every agent action.
 */
export interface Clearance {
  /** The agent identifier this clearance was issued for */
  readonly agent: string
  /** The permission scope */
  readonly permissions: Permissions
  /**
   * Validate that a proposed agent call is permitted.
   * Checks in order: action → contract → spend limit.
   *
   * @param call - The action + contract (+ optional spend) the agent wants to execute
   * @throws Error if the action or contract is not allowed, or spend exceeds limit
   */
  validate(call: AgentCall): void
  /**
   * Check whether this clearance has expired.
   *
   * @returns `true` if the current time is past `createdAt + expiry * 1000ms`
   */
  isExpired(): boolean
}

/**
 * Create a Clearance with a given permission scope.
 *
 * Like issuing a scoped access token: the agent can only do what the
 * permissions allow, and the token expires after `expiry` seconds.
 *
 * @param options - ClearanceOptions with agent ID and permissions
 * @param internal - Internal options for testing (e.g. time injection)
 * @returns A Clearance object with `validate` and `isExpired` methods
 *
 * @example
 * ```ts
 * const clearance = createClearance({
 *   agent: '0xagentAddress',
 *   permissions: {
 *     allowedContracts: ['0xUniswapV3Router'],
 *     allowedActions: ['swap'],
 *     spendLimit: { ETH: 1_000_000_000_000_000_000n }, // 1 ETH max
 *     expiry: 86400, // 24 hours
 *   },
 * })
 *
 * clearance.validate({ action: 'swap', contract: '0xUniswapV3Router' }) // OK
 * clearance.validate({ action: 'transfer', contract: '0xUniswap' })     // throws
 * clearance.validate({
 *   action: 'swap',
 *   contract: '0xUniswapV3Router',
 *   spend: { token: 'ETH', amount: 2_000_000_000_000_000_000n }, // throws — exceeds 1 ETH
 * })
 * ```
 */
export function createClearance(
  options: ClearanceOptions,
  { now = Date.now }: { now?: () => number } = {}
): Clearance {
  const createdAt = now()
  const { permissions } = options

  // Pre-compute O(1) lookup sets. Contract addresses are lowercased for
  // case-insensitive comparison (EVM addresses are checksummed but functionally identical).
  const actionsSet = new Set(permissions.allowedActions)
  const contractsSet = new Set(permissions.allowedContracts.map((c) => c.toLowerCase()))

  return {
    agent: options.agent,
    permissions,

    validate(call: AgentCall): void {
      if (!actionsSet.has(call.action)) {
        throw new Error(`Action "${call.action}" not in allowedActions`)
      }
      if (!contractsSet.has(call.contract.toLowerCase())) {
        throw new Error(`Contract "${call.contract}" not in allowedContracts`)
      }
      if (call.spend !== undefined) {
        const limit = permissions.spendLimit[call.spend.token]
        if (limit !== undefined && call.spend.amount > limit) {
          throw new Error(
            `Spend of ${call.spend.amount} for "${call.spend.token}" exceeds limit ${limit}`
          )
        }
      }
    },

    isExpired(): boolean {
      return now() > createdAt + permissions.expiry * 1000
    },
  }
}
