// 발급 전략 공통 인터페이스.
// Stage 2~4에서 naive / db-lock / redis 전략이 이 시그니처를 공유한다.
export interface IssueResult {
  ok: boolean;
  reason?: 'SOLD_OUT' | 'ALREADY_ISSUED' | 'RETRY_EXHAUSTED';
  couponId?: string;
  // Stage 4 심화: 비동기 큐 전략은 슬롯만 선점하고 발급을 워커에 위임한다.
  // 이 경우 couponId 없이 queued=true 로 응답(202 Accepted).
  queued?: boolean;
}

export interface IssueStrategy {
  readonly name: string;
  issue(campaignId: string, userKey: string): Promise<IssueResult>;
}
