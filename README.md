# preflight + clearance

> AI 에이전트의 EVM 온체인 행동을 검증하고 안전하게 실행하는 오픈소스 개발자 SDK

## 패키지

| 패키지 | 설명 | Phase |
|--------|------|-------|
| [`@preflight/core`](./packages/preflight-core) | AnvilFork + 시나리오 API + On-chain 어설션 | Phase 1 |
| [`@clearance/core`](./packages/clearance-core) | EIP-7702 기반 에이전트 실행 권한 관리 | Phase 2 |
| [`@preflight/cli`](./packages/preflight-cli) | CLI 테스트 러너 | Phase 3 |

## 왜 preflight인가

AI 에이전트가 DeFi 프로토콜에서 실제 온체인 트랜잭션을 실행할 때, 의도한 대로만 동작하는지 어떻게 검증하나요? 실제 체인에서 테스트하면 실수 시 자산 손실이 발생할 수 있고, 단순 목업(mock)은 EVM 실행 환경을 재현하지 못합니다.

**preflight**는 Anvil 포크 위에서 AI 에이전트의 온체인 행동을 선언적으로 테스트하는 프레임워크입니다.

- **실제 Anvil 프로세스 기반** — 목업 아님, 실제 EVM 실행 환경
- **어떤 EVM 체인도 지원** — Ethereum, Optimism, Base, Arbitrum, Tokamak L2
- **어떤 LLM 프레임워크와도 연동** — LangChain, OpenAI Agents SDK, CrewAI
- **bigint 전용** — wei 단위 정밀도 손실 없음
- **EVMbench 보완** — 보안(EVMbench) + 행동 테스트(preflight) 둘 다

## Quick Start

```bash
pnpm add @preflight/core
```

```typescript
import { preflight, assertOnChain, mockLLM, createMockOpenAI } from '@preflight/core'

// 1. 시나리오 선언
const scenario = preflight.scenario('1 ETH swap on Uniswap', {
  fork: {
    rpc: process.env.FORK_RPC_URL!,
    blockNumber: 20_000_000n, // 재현 가능한 고정 블록
  },
})

// 2. LLM 모킹 — 실제 OpenAI 호출 없이 결정론적 테스트
const mock = mockLLM({
  responses: [
    { prompt: /swap/, reply: 'swap 1 ETH for USDC on Uniswap V3' },
  ],
})
const openai = createMockOpenAI(mock)

// 3. 시나리오 실행 + On-chain 어설션
await scenario.run(async (ctx) => {
  // 에이전트 실행 전 스냅샷
  const before = {
    balances: { '0xUserAddress': { ETH: 10_000_000_000_000_000_000n } },
    blockNumber: await ctx.fork.client.getBlockNumber(),
  }

  // AI 에이전트 실행 (mockLLM으로 결정론적 제어)
  const reply = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'swap 1 ETH for USDC' }],
  })

  // 에이전트 실행 후 스냅샷
  const after = {
    balances: { '0xUserAddress': { ETH: 8_950_000_000_000_000_000n } },
    blockNumber: await ctx.fork.client.getBlockNumber(),
  }

  // On-chain 어설션 (체이닝 지원)
  assertOnChain({ snapshots: { before, after }, gasUsed: 150_000n, approvals: [] })
    .balanceDecreased('ETH', { address: '0xUserAddress', by: 1_000_000_000_000_000_000n })
    .gasUsed({ max: 300_000n })
    .noUnexpectedApprovals()
})
```

## clearance — 권한 스코핑

```bash
pnpm add @clearance/core
```

```typescript
import { createClearance } from '@clearance/core'

const clearance = createClearance({
  agent: '0xAgentAddress',
  permissions: {
    allowedContracts: ['0xUniswapV3Router'],
    allowedActions: ['swap'],
    spendLimit: { ETH: 1_000_000_000_000_000_000n }, // 1 ETH max
    expiry: 86400, // 24시간
  },
})

// 에이전트 실행 전 검증
clearance.validate({ action: 'swap', contract: '0xUniswapV3Router' }) // OK
clearance.validate({ action: 'transfer', contract: '0xUniswap' })     // throws!
```

## 환경변수

```bash
# .env
FORK_RPC_URL=https://rpc.mevblocker.io    # EVM 포크용 RPC URL (필수)
FORK_BLOCK_NUMBER=20000000                # 재현 가능한 고정 블록 (선택)
```

## 개발

```bash
# 의존성 설치
pnpm install

# 전체 테스트
pnpm test

# 특정 패키지 테스트
cd packages/preflight-core && pnpm test
cd packages/clearance-core && pnpm test

# 빌드
pnpm build
```

## 프로젝트 구조

```
preflight/
├── packages/
│   ├── preflight-core/     # @preflight/core
│   │   └── src/
│   │       ├── fork.ts     # createFork() — AnvilFork 생성
│   │       ├── scenario.ts # preflight.scenario() — 시나리오 선언
│   │       ├── assert.ts   # assertOnChain() — On-chain 어설션
│   │       ├── mock-llm.ts # mockLLM() — LLM 모킹
│   │       └── index.ts    # 진입점
│   ├── clearance-core/     # @clearance/core
│   │   └── src/
│   │       ├── clearance.ts # createClearance() — 권한 스코핑
│   │       └── index.ts
│   └── preflight-cli/      # @preflight/cli (Phase 3)
├── pnpm-workspace.yaml
└── package.json
```

## 로드맵

| Phase | 기능 | 상태 |
|-------|------|------|
| Phase 1 | AnvilFork + 시나리오 API + On-chain 어설션 | ✅ 완료 |
| Phase 2 | clearance 권한 스코핑 SDK | ✅ 완료 |
| Phase 3 | CLI + LangChain/OpenAI 어댑터 | 예정 |
| Phase 4 | npm 배포 + 예제 + Tokamak 어댑터 | 예정 |
| Phase 5+ | EIP-7702 실 서명 + 테스트넷 | 미정 |

## 라이선스

MIT
