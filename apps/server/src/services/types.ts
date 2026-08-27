// 발급 전략 공통 인터페이스.
// Stage 2~4에서 naive / db-lock / redis 전략이 이 시그니처를 공유한다.
export interface IssueResult {
  ok: boolean;
  reason?: 'SOLD_OUT' | 'ALREADY_ISSUED' | 'RETRY_EXHAUSTED';
  couponId?: string;
}

export interface IssueStrategy {
  readonly name: string;
  issue(campaignId: string, userKey: string): Promise<IssueResult>;
}
