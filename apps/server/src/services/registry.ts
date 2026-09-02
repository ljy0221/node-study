import { atomicStrategy } from './issue.atomic.js';
import { naiveStrategy } from './issue.naive.js';
import { optimisticStrategy } from './issue.optimistic.js';
import { pessimisticStrategy } from './issue.pessimistic.js';
import { redisStrategy } from './issue.redis.js';
import { redisLuaStrategy } from './issue.redisLua.js';
import type { IssueStrategy } from './types.js';

// 발급 전략 레지스트리.
// 요청 시 ?strategy=naive 처럼 골라서 같은 조건으로 벤치마크할 수 있게 한다.
const strategies: Record<string, IssueStrategy> = {
  naive: naiveStrategy,
  atomic: atomicStrategy, // Stage 3 실습 ① ✅
  pessimistic: pessimisticStrategy, // Stage 3 실습 ② ✅
  optimistic: optimisticStrategy, // Stage 3 실습 ③ ✅
  redis: redisStrategy, // Stage 4 ✅
  'redis-lua': redisLuaStrategy, // Stage 4 심화 (직접 구현 중)
};

export const DEFAULT_STRATEGY = 'naive';

export function getStrategy(name?: string): IssueStrategy {
  const key = name ?? DEFAULT_STRATEGY;
  const strategy = strategies[key];
  if (!strategy) {
    const available = Object.keys(strategies).join(', ');
    throw new Error(`Unknown strategy '${key}'. Available: ${available}`);
  }
  return strategy;
}

export function registerStrategy(strategy: IssueStrategy): void {
  strategies[strategy.name] = strategy;
}

export function listStrategies(): string[] {
  return Object.keys(strategies);
}
