import { useState } from 'react';
import './ProjectBid.css';

const BID_RULES = `Write a very short bid (2-3 sentences max). Follow these rules strictly:
- Open with a single enthusiastic word: "Absolutely!", "Perfect!", or "Yes!" — never start with "Hi" or the client name unless a name is provided, in which case use "Hi [name], Yes!" or "Hi [name], Absolutely!"
- Immediately say you do this type of work daily/regularly and can start right away with fast delivery
- Add one short sentence hinting at the result (not tasks) — what the client will get
- End with a call to action: ask them to send the files/details
- Sign off with: "Kind regards,\\nBerk"
- Never list tasks or deliverables
- Never mention price or timeline
- Maximum 60 words total (excluding sign-off)
- Confident, direct, no fluff`;

const ANALYZE_RULES = `Analyze the following project listing. Write a single short paragraph in Turkish. Explain what the client wants and what needs to be done. If budget or deadline is mentioned include it naturally in the paragraph. No headers, no bullet points, no formatting — just plain text.`;

export default function ProjectBid() {
  const [projectDetails, setProjectDetails] = useState('');
  const [clientName, setClientName] = useState('');

  const [result, setResult] = useState('');
  const [resultType, setResultType] = useState(null); // 'analyze' | 'bid'
  const [loading, setLoading] = useState(null); // 'analyze' | 'bid' | null
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const callApi = async (prompt, maxTokens) => {
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setError('API key not found → Settings → AI'); return null; }
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
        `${ANALYZE_RULES}\n\nProject listing:\n${projectDetails}`, 1000);
      if (res) { setResult(res); setResultType('analyze'); }
    } catch (e) { setError(e.message || 'Analysis failed.'); }
    finally { setLoading(null); }
  };

  const handleBid = async () => {
    if (!projectDetails.trim()) return;
    setLoading('bid');
    setResult('');
    setResultType(null);
    try {
      const res = await callApi(
        `You are an experienced Upwork freelancer. Write a short bid proposal. Follow ALL rules strictly.\n\n[Rules]\n${BID_RULES}\n\nCRITICAL RULES (override everything else):\n1. ${clientName.trim() ? `The bid MUST begin with exactly "Hi ${clientName.trim()}, " (inline, immediately followed by the rest of the text on the SAME line — no line break after the greeting).` : 'No client name provided, skip greeting name.'}\n2. Do NOT list what you will do. Do NOT mention specific tasks, tools, or deliverables.\n3. You may use ONE single general word to hint at the domain (e.g. "design", "development", "editing") — nothing more.\n4. If the client mentions a deadline or timeline, acknowledge it naturally and confirm you can meet it easily.\n\n[Project]\n${projectDetails}\n\nOutput only the bid text.`, 400);
      if (res) { setResult(res); setResultType('bid'); }
    } catch (e) { setError(e.message || 'Failed to generate bid.'); }
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
      </div>

      <div className="pb-main-row">
        <div className="pb-left">
          <div className="pb-action-row">
            <button className="pb-action-btn pb-analyze-btn" onClick={handleAnalyze} disabled={!!loading || !projectDetails.trim()}>
              {loading === 'analyze' ? <><span className="pb-spinner" /> Analyzing...</> : 'Analyze'}
            </button>
            <button className="pb-action-btn pb-bid-btn" onClick={handleBid} disabled={!!loading || !projectDetails.trim()}>
              {loading === 'bid' ? <><span className="pb-spinner" /> Generating...</> : 'Write Bid'}
            </button>
          </div>
          {error && <div className="pb-error">{error}</div>}
          <div className="pb-field">
            <label className="pb-label">Client Name <span className="pb-optional">(optional)</span></label>
            <input className="pb-input" type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name..." />
          </div>
          <div className="pb-field pb-field-grow">
            <label className="pb-label">Project Listing</label>
            <textarea
              className="pb-textarea pb-details"
              value={projectDetails}
              onChange={e => { setProjectDetails(e.target.value); setResult(''); setResultType(null); }}
              placeholder="Paste the Upwork listing or project description here..."
              autoFocus
            />
          </div>
        </div>

        <div className="pb-right">
          <div className="pb-result-header">
            <span className="pb-result-title">{resultType === 'analyze' ? 'Project Analysis' : resultType === 'bid' ? 'Generated Bid' : ''}</span>
            {result && <button className="pb-copy-btn" onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '✓ Copied' : 'Copy'}</button>}
          </div>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="pb-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            </div>
          ) : resultType === 'analyze' ? (
            <div className="pb-summary-body">{renderAnalysis(result)}</div>
          ) : resultType === 'bid' ? (
            <textarea className="pb-textarea pb-output" value={result} onChange={e => setResult(e.target.value)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
