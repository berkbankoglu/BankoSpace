import { useState } from 'react';
import './ProjectBid.css';

const DEFAULT_RULES = `Teklif yazarken şu kurallara uy:
- Kısa ve öz ol (max 150 kelime)
- Müşterinin sorununu anladığını göster
- Deneyimini somut örnekle belirt
- Fiyat/süre tahminini sona ekle
- Samimi ve profesyonel ton kullan
- Türkçe yaz`;

export default function ProjectBid() {
  const [projectDetails, setProjectDetails] = useState('');
  const [clientName, setClientName] = useState('');
  const [bidRules, setBidRules] = useState(() =>
    localStorage.getItem('bid_rules') || DEFAULT_RULES
  );
  const [rulesEdit, setRulesEdit] = useState(bidRules);
  const [showRules, setShowRules] = useState(false);
  const [generatedBid, setGeneratedBid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const generateBid = async () => {
    if (!projectDetails.trim()) return;
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) {
      setError('API key bulunamadı. Lütfen Settings > API key alanına Anthropic API key\'ini gir.');
      return;
    }
    setLoading(true);
    setError(null);
    setGeneratedBid('');
    try {
      const bodyStr = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Sen deneyimli bir Upwork freelancer'ısın. Aşağıdaki proje için teklif yazısı hazırla.\n\n[Teklif Kuralları]\n${bidRules}\n\n[Müşteri Adı]\n${clientName.trim() || 'Belirtilmedi'}\n\n[Proje Detayları]\n${projectDetails}\n\nSadece teklif yazısını yaz, başka hiçbir şey ekleme.`,
        }],
      });
      const text = await window.__TAURI__.core.invoke('fetch_post', {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: bodyStr,
      });
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error.message || 'API error');
      setGeneratedBid(data.content[0].text);
    } catch (e) {
      setError(e.message || 'Teklif oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedBid) return;
    navigator.clipboard.writeText(generatedBid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveRules = () => {
    setBidRules(rulesEdit);
    localStorage.setItem('bid_rules', rulesEdit);
    setShowRules(false);
  };

  return (
    <div className="pb-container">
      <div className="pb-header">
        <h2 className="pb-title">Project Bid</h2>
        <button className="pb-rules-btn" onClick={() => { setRulesEdit(bidRules); setShowRules(true); }}>
          ⚙ Kurallar
        </button>
      </div>

      {showRules && (
        <div className="pb-rules-panel">
          <div className="pb-rules-header">
            <span className="pb-rules-title">Teklif Kuralları</span>
            <div className="pb-rules-actions">
              <button className="pb-save-btn" onClick={saveRules}>Kaydet</button>
              <button className="pb-close-btn" onClick={() => setShowRules(false)}>✕</button>
            </div>
          </div>
          <textarea
            className="pb-rules-textarea"
            value={rulesEdit}
            onChange={e => setRulesEdit(e.target.value)}
            placeholder="Teklif yazma kurallarını buraya gir..."
          />
        </div>
      )}

      <div className="pb-form">
        <div className="pb-field">
          <label className="pb-label">Müşteri Adı <span className="pb-optional">(opsiyonel)</span></label>
          <input
            className="pb-input"
            type="text"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            placeholder="Müşteri adı..."
          />
        </div>

        <div className="pb-field">
          <label className="pb-label">Proje Detayları</label>
          <textarea
            className="pb-textarea pb-details"
            value={projectDetails}
            onChange={e => setProjectDetails(e.target.value)}
            placeholder="Upwork ilanını veya proje açıklamasını buraya yapıştır..."
          />
        </div>

        <button
          className="pb-generate-btn"
          onClick={generateBid}
          disabled={loading || !projectDetails.trim()}
        >
          {loading ? <><span className="pb-spinner" /> Oluşturuluyor...</> : 'Teklif Oluştur →'}
        </button>

        {error && <div className="pb-error">{error}</div>}
      </div>

      {generatedBid && (
        <div className="pb-result">
          <div className="pb-result-header">
            <span className="pb-result-title">Oluşturulan Teklif</span>
            <button className="pb-copy-btn" onClick={handleCopy}>
              {copied ? '✓ Kopyalandı' : 'Kopyala'}
            </button>
          </div>
          <textarea
            className="pb-textarea pb-output"
            value={generatedBid}
            onChange={e => setGeneratedBid(e.target.value)}
            readOnly={false}
          />
        </div>
      )}
    </div>
  );
}
