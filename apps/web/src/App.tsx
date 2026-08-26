import { useEffect, useState } from 'react';
import { getCampaign, issueCoupon, type Campaign } from './api.js';

const CAMPAIGN_ID = 'demo-campaign';

export default function App() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  // 브라우저 세션마다 임의 userKey (1인 1매 데모용)
  const [userKey] = useState(
    () => `web-${Math.random().toString(36).slice(2, 8)}`,
  );

  function addLog(line: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev]);
  }

  async function refresh() {
    try {
      setCampaign(await getCampaign(CAMPAIGN_ID));
    } catch (e) {
      addLog(`조회 실패: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 2000); // 재고 폴링
    return () => clearInterval(t);
  }, []);

  async function onIssue() {
    setBusy(true);
    try {
      const { status, body } = await issueCoupon(CAMPAIGN_ID, userKey);
      if (body.ok) addLog(`✅ 발급 성공 (${body.couponId?.slice(0, 8)})`);
      else if (body.reason === 'ALREADY_ISSUED') addLog('⚠️ 이미 발급받음');
      else addLog(`❌ 품절 (status ${status})`);
      await refresh();
    } catch (e) {
      addLog(`요청 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const remaining = campaign?.remaining ?? 0;
  const soldOut = remaining <= 0;

  return (
    <div className="card">
      <h1>🎟️ 선착순 쿠폰 발급</h1>

      <div className="stock">
        {remaining}
        <small> / {campaign?.totalStock ?? '-'} 남음</small>
      </div>

      <button onClick={onIssue} disabled={busy || soldOut || !campaign}>
        {soldOut ? '품절' : busy ? '요청 중...' : '쿠폰 발급받기'}
      </button>

      <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.75rem' }}>
        내 식별자: {userKey}
      </div>

      <div className="log">
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
