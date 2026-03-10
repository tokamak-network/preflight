import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPreflight } from './cli'
import type { PreflightOptions } from './cli'

const mockClose = vi.fn()
const mockVitest = {
  state: {
    getCountOfFailedTests: vi.fn(() => 0),
    collectPaths: vi.fn(() => ['test.preflight.ts']),
  },
  close: mockClose,
}

/** Minimal mock of a TestModule with one test of the given state */
function makeModule(state: 'passed' | 'failed') {
  return {
    children: {
      allTests: function* (filterState?: string) {
        if (!filterState || filterState === state) {
          yield { result: () => ({ state }) }
        }
      },
    },
  }
}

vi.mock('vitest/node', () => ({
  startVitest: vi.fn((_mode: string, files: string[]) => {
    const failingFiles = files.filter((f) => f.includes('failing'))
    const passingFiles = files.filter((f) => !f.includes('failing'))
    return Promise.resolve({
      state: {
        getCountOfFailedTests: () => failingFiles.length,
        getTestModules: () => [
          ...failingFiles.map(() => makeModule('failed')),
          ...passingFiles.map(() => makeModule('passed')),
        ],
        collectPaths: () => files,
      },
      close: mockClose,
    })
  }),
}))

describe('runPreflight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('input validation', () => {
    it('should throw when no files provided (empty array)', async () => {
      await expect(runPreflight([], {})).rejects.toThrow('No test files specified')
    })

    it('should accept a single file', async () => {
      // Should not throw on valid input (may fail or succeed depending on vitest mock)
      await expect(runPreflight(['test.preflight.ts'], {})).resolves.toBeDefined()
    })

    it('should accept multiple files', async () => {
      await expect(
        runPreflight(['a.preflight.ts', 'b.preflight.ts'], {})
      ).resolves.toBeDefined()
    })
  })

  describe('fork option', () => {
    it('should pass fork RPC URL via options', async () => {
      const options: PreflightOptions = {
        fork: 'https://eth-mainnet.g.alchemy.com/v2/demo',
      }
      // Should not throw — fork option is valid
      await expect(runPreflight(['test.preflight.ts'], options)).resolves.toBeDefined()
    })
  })

  describe('live option', () => {
    it('should pass live network via options', async () => {
      const options: PreflightOptions = {
        live: 'mainnet',
      }
      await expect(runPreflight(['test.preflight.ts'], options)).resolves.toBeDefined()
    })
  })

  describe('return value', () => {
    it('should return exit code 0 on success', async () => {
      const result = await runPreflight(['passing.preflight.ts'], {})
      expect(result).toHaveProperty('exitCode')
      expect(result.exitCode).toBe(0)
    })

    it('should return exit code 1 on test failure', async () => {
      const result = await runPreflight(['failing.preflight.ts'], {})
      expect(result.exitCode).toBe(1)
    })

    it('should include test results summary with accurate counts', async () => {
      const result = await runPreflight(['test.preflight.ts'], {})
      expect(result.results.passed).toBe(1)
      expect(result.results.failed).toBe(0)
      expect(result.results.total).toBe(1)
    })
  })
})
