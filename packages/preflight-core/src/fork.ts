import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { createAnvil } from '@viem/anvil'

/**
 * Options for creating an Anvil fork environment.
 */
export interface ForkOptions {
  /** RPC URL of the chain to fork */
  readonly rpc: string
  /** Block number to fork at (defaults to latest) */
  readonly blockNumber?: bigint
  /** Local Anvil port (defaults to auto-assignment via randomPort) */
  readonly port?: number
}

/**
 * A running Anvil fork instance with a viem PublicClient.
 */
export interface Fork {
  /** viem PublicClient connected to the local Anvil instance */
  readonly client: PublicClient
  /** Local Anvil HTTP URL */
  readonly rpcUrl: string
  /** Stops the Anvil process */
  readonly stop: () => Promise<void>
}

/**
 * Returns a random port in the ephemeral range (49152-65535).
 *
 * @viem/anvil detects startup by matching "Listening on host:port" in stdout,
 * so port 0 (OS auto-assign) does not work — we must specify an explicit port.
 */
function randomPort(): number {
  return 49152 + Math.floor(Math.random() * (65535 - 49152))
}

/**
 * Creates a local Anvil fork of an EVM chain.
 *
 * Like spinning up a local copy of Ethereum — you get a full blockchain
 * environment to test against without touching the real network.
 *
 * Note: Phase 1 uses the `mainnet` chain definition for the viem PublicClient.
 * Multi-chain support (Base, Optimism, Arbitrum) is planned for Phase 2.
 *
 * @param options - Fork configuration (RPC URL, optional block number and port)
 * @returns A Fork object with a connected PublicClient and a stop function
 * @throws If Anvil fails to start (RPC unreachable, port conflict, timeout)
 */
export async function createFork(options: ForkOptions): Promise<Fork> {
  const port = options.port ?? randomPort()
  const anvil = createAnvil({
    forkUrl: options.rpc,
    forkBlockNumber: options.blockNumber,
    port,
    startTimeout: 30_000,
  })

  try {
    await anvil.start()
  } catch (err) {
    // Ensure Anvil process is cleaned up if startup fails, to avoid port leaks.
    await anvil.stop().catch(() => undefined)
    throw err
  }

  const rpcUrl = `http://${anvil.host}:${anvil.port}`
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  })

  return {
    client,
    rpcUrl,
    stop: () => anvil.stop(),
  }
}
