/**
 * LLM mocking utilities for preflight scenarios.
 *
 * Like a test double for your LLM: instead of calling OpenAI (slow, expensive,
 * non-deterministic), you declare what replies to return for given prompts.
 * This keeps tests fast, free, and reproducible.
 */

/** A single mock rule: if the prompt matches `prompt`, return `reply`. */
export interface MockResponse {
  /** Match pattern — regex tests against the prompt, string checks `includes` */
  readonly prompt: RegExp | string
  /** The reply to return when `prompt` matches */
  readonly reply: string
}

/** Configuration for `mockLLM` */
export interface MockLLMOptions {
  /** Ordered list of mock rules. First match wins. */
  readonly responses: readonly MockResponse[]
}

/**
 * A resolved LLM mock — call `resolve(prompt)` to get the mocked reply.
 * Throws if no rule matches.
 */
export interface LLMMock {
  /**
   * Resolve a prompt to its mocked reply.
   * @param prompt - The user prompt to match
   * @returns The matched reply string
   * @throws Error if no mock rule matches the prompt
   */
  resolve(prompt: string): string
}

/**
 * Create an LLM mock from a list of prompt→reply rules.
 *
 * @param options - MockLLMOptions with an ordered list of `responses`
 * @returns LLMMock instance
 *
 * @example
 * ```ts
 * const mock = mockLLM({
 *   responses: [
 *     { prompt: /swap/, reply: 'swap 1 ETH for USDC on Uniswap' },
 *   ],
 * })
 * ```
 */
export function mockLLM(options: MockLLMOptions): LLMMock {
  return {
    resolve(prompt: string): string {
      const match = options.responses.find((r) =>
        r.prompt instanceof RegExp ? r.prompt.test(prompt) : prompt.includes(r.prompt)
      )
      if (!match) {
        throw new Error(`No mock response found for: "${prompt}"`)
      }
      return match.reply
    },
  }
}

/** Minimal shape of an OpenAI chat completion params object */
export interface ChatCompletionParams {
  readonly model: string
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>
}

/** Minimal shape of an OpenAI chat completion response */
export interface ChatCompletionResponse {
  readonly choices: ReadonlyArray<{
    readonly message: { readonly role: string; readonly content: string }
  }>
}

/**
 * Minimal OpenAI-compatible mock client shape returned by `createMockOpenAI`.
 * Matches `openai.chat.completions.create(...)` so it can be used as a drop-in
 * replacement in tests without importing the real `openai` SDK.
 */
export interface MockOpenAIClient {
  readonly chat: {
    readonly completions: {
      create(params: ChatCompletionParams): Promise<ChatCompletionResponse>
    }
  }
}

/**
 * Create an OpenAI SDK-compatible mock client backed by an LLMMock.
 *
 * @param mock - LLMMock instance (from `mockLLM`)
 * @returns A MockOpenAIClient shaped like the OpenAI client's `chat.completions` API
 *
 * @example
 * ```ts
 * const mock = mockLLM({ responses: [{ prompt: /swap/, reply: 'swap ETH' }] })
 * const openai = createMockOpenAI(mock)
 * const res = await openai.chat.completions.create({ model: 'gpt-4o', messages: [...] })
 * ```
 */
export function createMockOpenAI(mock: LLMMock): MockOpenAIClient {
  return {
    chat: {
      completions: {
        async create(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
          if (params.messages.length === 0) {
            throw new Error('createMockOpenAI: messages array must not be empty')
          }
          const lastMessage = params.messages[params.messages.length - 1]
          const reply = mock.resolve(lastMessage.content)
          return {
            choices: [{ message: { role: 'assistant', content: reply } }],
          }
        },
      },
    },
  }
}
