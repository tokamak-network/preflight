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
  /** List of contract addresses the agent may call */
  readonly allowedContracts: readonly string[]
  /** List of action names (e.g. 'swap', 'addLiquidity') the agent may execute */
  readonly allowedActions: readonly string[]
  /** Per-token spend limits (bigint wei amounts) */
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

/** A call being validated — must be in allowedActions + allowedContracts */
export interface AgentCall {
  /** The action name being attempted */
  readonly action: string
  /** The contract address being called */
  readonly contract: string
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
   * Checks action first, then contract.
   *
   * @param call - The action + contract the agent wants to execute
   * @throws Error if the action or contract is not in the allowed lists
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
 * @returns A Clearance object with `validate` and `isExpired` methods
 *
 * @example
 * ```ts
 * const clearance = createClearance({
 *   agent: '0xagentAddress',
 *   permissions: {
 *     allowedContracts: ['0xUniswapV3Router'],
 *     allowedActions: ['swap'],
 *     spendLimit: { ETH: 1_000_000_000_000_000_000n },
 *     expiry: 86400, // 24 hours
 *   },
 * })
 *
 * clearance.validate({ action: 'swap', contract: '0xUniswapV3Router' }) // OK
 * clearance.validate({ action: 'transfer', contract: '0xUniswap' })     // throws
 * ```
 */
export function createClearance(options: ClearanceOptions): Clearance {
  const createdAt = Date.now()

  return {
    agent: options.agent,
    permissions: options.permissions,

    validate(call: AgentCall): void {
      if (!options.permissions.allowedActions.includes(call.action)) {
        throw new Error(`Action "${call.action}" not in allowedActions`)
      }
      if (!options.permissions.allowedContracts.includes(call.contract)) {
        throw new Error(`Contract "${call.contract}" not in allowedContracts`)
      }
    },

    isExpired(): boolean {
      return Date.now() > createdAt + options.permissions.expiry * 1000
    },
  }
}
