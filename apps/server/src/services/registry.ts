import { naiveStrategy } from './issue.naive.js';
import type { IssueStrategy } from './types.js';

// 발급 전략 레지스트리.
// Stage 3~4에서 'atomic', 'pessimistic', 'optimistic', 'redis' 등을 여기 등록한다.
// 요청 시 ?strategy=naive 처럼 골라서 같은 조건으로 벤치마크할 수 있게 한다.
const strategies: Record<string, IssueStrategy> = {
  naive: naiveStrategy,
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
