import { useState, useEffect, useRef } from 'react';
import './ProjectBid.css';

function truncateBid(text, maxWords = 22) {
  const signoffRe = /\n\nKind regards,[\s\S]*$/i;
  const signoffMatch = text.match(signoffRe);
  const signoff = signoffMatch ? signoffMatch[0] : '\n\nKind regards,\nBerk';
  const body = text.replace(signoffRe, '').trim();
  const words = body.split(/\s+/);
  const trimmed = words.slice(0, maxWords).join(' ').replace(/[,.]?$/, '.');
  return trimmed + signoff;
}

const BID_RULES = `Write a very short bid — MAX 22 words before the sign-off. Exactly 2 sentences:
Sentence 1 (MAX 10 words): opener word (Yes!/Perfect!/Absolutely!) + you do this regularly + available now.
Sentence 2 (MAX 12 words): one CTA asking them to send details.
Sign off with: "Kind regards,\\nBerk"
Never copy words from the project text. Never list tasks, price, or timeline.`;

const ANALYZE_RULES = `Summarize the following project listing in 2-3 sentences in Turkish. Only mention what is explicitly written. Do not comment on missing information. No headers, no bullets, plain text only.`;

export default function ProjectBid() {
  const [projectDetails, setProjectDetails] = useState('');
  const [clientName, setClientName] = useState('');

  const [result, setResult] = useState('');
  const [resultType, setResultType] = useState(null); // 'analyze' | 'bid'
  const [loading, setLoading] = useState(null); // 'analyze' | 'bid' | null
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // Refs for keyboard handler (avoids stale closures)
  const analyzeRef = useRef(null);
  const bidRef = useRef(null);
  const resultRef = useRef('');
  resultRef.current = result;

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); analyzeRef.current?.(); }
      if (e.key === 'w' || e.key === 'W') { e.preventDefault(); bidRef.current?.(); }
      if ((e.key === 'c' || e.key === 'C') && resultRef.current) {
        e.preventDefault();
        navigator.clipboard.writeText(resultRef.current);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const callApi = async (prompt, maxTokens) => {
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setError('API key not found → Settings → AI'); return null; }
    setError(null);
    const text = await window.__TAURI__.core.invoke('fetch_post', {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error.message || 'API error');
    return data.content[0].text.trim();
  };

  const handleAnalyze = analyzeRef.current = async () => {
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

  const handleBid = bidRef.current = async () => {
    if (!projectDetails.trim()) return;
    setLoading('bid');
    setResult('');
    setResultType(null);
    try {
      const name = clientName.trim();
      const greeting = name ? `Absolutely! Hi ${name},` : `Absolutely!`;
      const res = await callApi(
        `Write a short Upwork bid. Output ONLY the bid text, nothing else.

EXACT format:
${greeting} [1 sentence MAX 10 words: confirm you do this exact thing + available now] [1 sentence MAX 12 words: CTA asking them to send details/files]

Kind regards,
Berk

Rules:
- MUST start with exactly: ${greeting}
- Validate/confirm the client's specific need enthusiastically
- Never copy words from the project listing
- No lists, no headers, no extra sentences

Project: ${projectDetails}`, 90);
      if (res) { setResult(truncateBid(res)); setResultType('bid'); }
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
        <div className="pb-shortcuts-hint">
          <kbd>A</kbd> Analyze &nbsp;·&nbsp; <kbd>W</kbd> Write Bid &nbsp;·&nbsp; <kbd>C</kbd> Copy
        </div>
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
