import { useState } from 'react';
import './ProjectBid.css';

const DEFAULT_RULES = `Follow these rules when writing a bid:
- Be concise (max 150 words)
- Show that you understood the client's problem
- Mention your experience with a concrete example
- Add price/timeline estimate at the end
- Use a sincere and professional tone
- Write in English`;

export default function ProjectBid() {
  const [projectDetails, setProjectDetails] = useState('');
  const [clientName, setClientName] = useState('');
  const [bidRules, setBidRules] = useState(() => localStorage.getItem('bid_rules') || DEFAULT_RULES);
  const [rulesEdit, setRulesEdit] = useState(bidRules);
  const [showRules, setShowRules] = useState(false);

  const [result, setResult] = useState('');
  const [resultType, setResultType] = useState(null); // 'analyze' | 'bid'
  const [loading, setLoading] = useState(null); // 'analyze' | 'bid' | null
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const callApi = async (prompt, maxTokens) => {
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setError('API key bulunamadı → Ayarlar → Yapay Zeka'); return null; }
    setError(null);
    const text = await window.__TAURI__.core.invoke('fetch_post', {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error.message || 'API error');
    return data.content[0].text.trim();
  };

  const handleAnalyze = async () => {
    if (!projectDetails.trim()) return;
    setLoading('analyze');
    setResult('');
    setResultType(null);
    try {
      const res = await callApi(
        `Aşağıdaki proje ilanını Türkçe olarak analiz et. Şu formatta yanıt ver (başka bir şey yazma):

**Ne istiyor:** <2-3 cümle, müşteri tam olarak ne yaptırmak istiyor, hangi sorunu çözüyor>
**Görevler:** <madde madde tam olarak yapılması gereken işler, hiçbirini atlama>
**Teknoloji/Alan:** <kullanılacak teknolojiler, araçlar, platformlar>
**Süre:** <belirtilmişse süre ve deadline, yoksa "Belirtilmemiş">
**Bütçe:** <belirtilmişse bütçe aralığı, yoksa "Belirtilmemiş">
**Dikkat:** <mutlaka yapılması/yapılmaması gereken özel şartlar, tercihler, beklentiler>
**Zorluk:** <Kolay / Orta / Zor — neden>

Proje ilanı:
${projectDetails}`, 1000);
      if (res) { setResult(res); setResultType('analyze'); }
    } catch (e) { setError(e.message || 'Analiz başarısız.'); }
    finally { setLoading(null); }
  };

  const handleBid = async () => {
    if (!projectDetails.trim()) return;
    setLoading('bid');
    setResult('');
    setResultType(null);
    try {
      const res = await callApi(
        `You are an experienced Upwork freelancer. Write a bid proposal for the following project.\n\n[Bid Rules]\n${bidRules}\n\n[Client Name]\n${clientName.trim() || 'Not specified'}\n\n[Project Details]\n${projectDetails}\n\nWrite only the bid text, nothing else.`, 600);
      if (res) { setResult(res); setResultType('bid'); }
    } catch (e) { setError(e.message || 'Bid oluşturulamadı.'); }
    finally { setLoading(null); }
  };

  const renderAnalysis = (text) =>
    text.split('\n').map((line, i) => {
      const match = line.match(/^\*\*(.+?)\*\*:(.*)$/);
      if (match) return (
        <div key={i} className="pb-summary-row">
          <span className="pb-summary-label">{match[1]}:</span>
          <span className="pb-summary-value">{match[2].trim()}</span>
        </div>
      );
      return line.trim() ? <div key={i} className="pb-summary-row pb-summary-plain">{line}</div> : null;
    });

  return (
    <div className="pb-container">
      <div className="pb-header">
        <h2 className="pb-title">Project Bid</h2>
        <button className="pb-rules-btn" onClick={() => { setRulesEdit(bidRules); setShowRules(s => !s); }}>
          ⚙ Rules
        </button>
      </div>

      {showRules && (
        <div className="pb-rules-panel">
          <div className="pb-rules-header">
            <span className="pb-rules-title">Bid Rules</span>
            <div className="pb-rules-actions">
              <button className="pb-save-btn" onClick={() => { setBidRules(rulesEdit); localStorage.setItem('bid_rules', rulesEdit); setShowRules(false); }}>Save</button>
              <button className="pb-close-btn" onClick={() => setShowRules(false)}>✕</button>
            </div>
          </div>
          <textarea className="pb-rules-textarea" value={rulesEdit} onChange={e => setRulesEdit(e.target.value)} />
        </div>
      )}

      <div className="pb-main-row">
        <div className="pb-left">
          <div className="pb-field">
            <label className="pb-label">Client Name <span className="pb-optional">(optional)</span></label>
            <input className="pb-input" type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name..." />
          </div>
          <div className="pb-field pb-field-grow">
            <label className="pb-label">Proje İlanı</label>
            <textarea
              className="pb-textarea pb-details"
              value={projectDetails}
              onChange={e => { setProjectDetails(e.target.value); setResult(''); setResultType(null); }}
              placeholder="Upwork ilanını veya proje açıklamasını buraya yapıştırın..."
            />
          </div>
          <div className="pb-action-row">
            <button className="pb-action-btn pb-analyze-btn" onClick={handleAnalyze} disabled={!!loading || !projectDetails.trim()}>
              {loading === 'analyze' ? <><span className="pb-spinner" /> Analiz...</> : 'Analiz Et'}
            </button>
            <button className="pb-action-btn pb-bid-btn" onClick={handleBid} disabled={!!loading || !projectDetails.trim()}>
              {loading === 'bid' ? <><span className="pb-spinner" /> Generating...</> : 'Teklif Yaz'}
            </button>
          </div>
          {error && <div className="pb-error">{error}</div>}
        </div>

        {result && (
          <div className="pb-right">
            <div className="pb-result-header">
              <span className="pb-result-title">{resultType === 'analyze' ? 'Proje Analizi' : 'Generated Bid'}</span>
              <button className="pb-copy-btn" onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
            </div>
            {resultType === 'analyze' ? (
              <div className="pb-summary-body">{renderAnalysis(result)}</div>
            ) : (
              <textarea className="pb-textarea pb-output" value={result} onChange={e => setResult(e.target.value)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
