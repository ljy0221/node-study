import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

// 쿠폰 발급 부하테스트 — 동시성 거동을 관찰/비교하기 위한 스크립트.
//
// 환경변수로 조절 (기본값은 "재고 100에 동시 1000 요청"):
//   API_URL   기본 http://localhost:4000
//   CAMPAIGN  기본 demo-campaign
//   STRATEGY  기본 naive  (?strategy= 로 전략 교체 → Stage 3~4에서 재사용)
//   VUS       동시 가상 유저 수 (기본 200)
//   ITER      총 요청 수 (기본 1000)
//
// 실행 예:
//   k6 run load/issue.k6.js
//   k6 run -e STRATEGY=atomic -e VUS=300 -e ITER=2000 load/issue.k6.js

const API_URL = __ENV.API_URL || 'http://localhost:4000';
const CAMPAIGN = __ENV.CAMPAIGN || 'demo-campaign';
const STRATEGY = __ENV.STRATEGY || 'naive';
const VUS = Number(__ENV.VUS || 200);
const ITER = Number(__ENV.ITER || 1000);

// 응답 종류별 카운터 (요약에 찍힘)
const issued = new Counter('coupon_issued'); // 201 발급 성공
const soldOut = new Counter('coupon_sold_out'); // 410 품절
const dup = new Counter('coupon_already'); // 409 이미 발급

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations', // ITER개의 요청을 VUS명이 나눠 최대한 빠르게 소진
      vus: VUS,
      iterations: ITER,
      maxDuration: '60s',
    },
  },
};

export default function () {
  // 각 요청이 서로 다른 유저인 것처럼 (1인 1매 unique 제약을 피해 순수 경쟁만 관찰)
  const userKey = `k6-${__VU}-${__ITER}`;

  const res = http.post(
    `${API_URL}/api/campaigns/${CAMPAIGN}/issue?strategy=${STRATEGY}`,
    JSON.stringify({ userKey }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status === 201) issued.add(1);
  else if (res.status === 410) soldOut.add(1);
  else if (res.status === 409) dup.add(1);

  // 202 = 비동기 큐 전략의 "접수됨"(발급은 워커가 처리)
  check(res, {
    'status is 201/202/409/410': (r) => [201, 202, 409, 410].includes(r.status),
  });
}
