import { createFork } from './fork'
import type { ForkOptions, Fork } from './fork'

/** Options for creating a scenario */
export interface ScenarioOptions {
  /** Fork configuration — which chain and block to fork */
  readonly fork: ForkOptions
}

/**
 * Runtime context passed to the scenario callback.
 * Contains the running Anvil fork instance.
 */
export interface ScenarioContext {
  /** The running Anvil fork with a viem PublicClient */
  readonly fork: Fork
}

/**
 * A declared test scenario — a named unit of behavioral testing.
 *
 * Like a test case in Jest/Vitest, but for on-chain AI agent behavior:
 * it sets up a real EVM fork, runs your callback, then tears it down.
 */
export interface Scenario {
  /** Human-readable name of this scenario */
  readonly name: string
  /**
   * Run the scenario callback inside an Anvil fork environment.
   * The fork is automatically stopped after the callback completes
   * (even if the callback throws).
   *
   * @param fn - Async callback receiving the fork context
   */
  run(fn: (ctx: ScenarioContext) => Promise<void>): Promise<void>
}

/**
 * Create a Scenario that runs inside an Anvil fork.
 *
 * Like wrapping a test in `beforeEach`/`afterEach` automatically:
 * the fork starts before your callback and stops in `finally`.
 *
 * @param name - Scenario name
 * @param options - ScenarioOptions (fork config)
 * @returns Scenario object with a `run` method
 */
function scenario(name: string, options: ScenarioOptions): Scenario {
  return {
    name,
    run: async (fn) => {
      const fork = await createFork(options.fork)
      try {
        await fn({ fork })
      } finally {
        await fork.stop()
      }
    },
  }
}

/**
 * The `preflight` namespace — entry point for declaring test scenarios.
 *
 * @example
 * ```ts
 * const s = preflight.scenario('1 ETH swap on Uniswap', {
 *   fork: { rpc: 'https://eth.llamarpc.com', blockNumber: 20_000_000n },
 * })
 *
 * await s.run(async (ctx) => {
 *   // ctx.fork.client is a viem PublicClient connected to the local Anvil fork
 *   const block = await ctx.fork.client.getBlockNumber()
 *
 *   // assertOnChain takes an AssertContext (with snapshots + gasUsed + approvals),
 *   // which you build from on-chain data collected during the scenario run.
 *   // Example:
 *   // assertOnChain({ snapshots: { before, after }, gasUsed: 150_000n, approvals: [] })
 *   //   .balanceDecreased('ETH', { address: '0xUser', by: 1_000_000_000_000_000_000n })
 *   //   .gasUsed({ max: 300_000n })
 * })
 * ```
 */
export const preflight = { scenario } as const
