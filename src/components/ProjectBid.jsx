import { useState } from 'react';
import './ProjectBid.css';

const DEFAULT_BID_RULES = `Follow these rules when writing a bid:
- Be concise (max 150 words)
- Show that you understood the client's problem
- Mention your experience with a concrete example
- Add price/timeline estimate at the end
- Use a sincere and professional tone
- Write in English`;

const DEFAULT_ANALYZE_RULES = `Analyze the following project listing. Respond in this exact format (nothing else):

**What they want:** <2-3 sentences: what exactly the client wants to build, what problem it solves>
**Tasks:** <bullet-point list of everything that needs to be done, miss nothing>
**Tech/Domain:** <technologies, tools, platforms to be used>
**Timeline:** <duration and deadline if specified, otherwise "Not specified">
**Budget:** <budget range if specified, otherwise "Not specified">
**Notes:** <special requirements, preferences, or expectations that must/must not be done>
**Difficulty:** <Easy / Medium / Hard — why>`;

export default function ProjectBid() {
  const [projectDetails, setProjectDetails] = useState('');
  const [clientName, setClientName] = useState('');
  const [bidRules, setBidRules] = useState(() => localStorage.getItem('bid_rules') || DEFAULT_BID_RULES);
  const [analyzeRules, setAnalyzeRules] = useState(() => localStorage.getItem('analyze_rules') || DEFAULT_ANALYZE_RULES);
  const [rulesEdit, setRulesEdit] = useState('');
  const [showRules, setShowRules] = useState(null); // 'bid' | 'analyze' | null

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
        `${analyzeRules}\n\nProject listing:\n${projectDetails}`, 1000);
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
        `You are an experienced Upwork freelancer. Write a short bid proposal. Follow ALL rules strictly.\n\n[Rules]\n${bidRules}\n\nCRITICAL RULES (override everything else):\n1. ${clientName.trim() ? `The bid MUST begin with exactly "Hi ${clientName.trim()}, " (inline, immediately followed by the rest of the text on the SAME line — no line break after the greeting).` : 'No client name provided, skip greeting name.'}\n2. Do NOT list what you will do. Do NOT mention specific tasks, tools, or deliverables.\n3. You may use ONE single general word to hint at the domain (e.g. "design", "development", "editing") — nothing more.\n4. If the client mentions a deadline or timeline, acknowledge it naturally and confirm you can meet it easily.\n\n[Project]\n${projectDetails}\n\nOutput only the bid text.`, 400);
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pb-rules-btn" onClick={() => { setRulesEdit(analyzeRules); setShowRules(v => v === 'analyze' ? null : 'analyze'); }}>
            ⚙ Analyze Rules
          </button>
          <button className="pb-rules-btn" onClick={() => { setRulesEdit(bidRules); setShowRules(v => v === 'bid' ? null : 'bid'); }}>
            ⚙ Bid Rules
          </button>
        </div>
      </div>

      {showRules && (
        <div className="pb-rules-panel">
          <div className="pb-rules-header">
            <span className="pb-rules-title">{showRules === 'analyze' ? 'Analyze Rules' : 'Bid Rules'}</span>
            <div className="pb-rules-actions">
              <button className="pb-save-btn" onClick={() => {
                if (showRules === 'analyze') { setAnalyzeRules(rulesEdit); localStorage.setItem('analyze_rules', rulesEdit); }
                else { setBidRules(rulesEdit); localStorage.setItem('bid_rules', rulesEdit); }
                setShowRules(null);
              }}>Save</button>
              <button className="pb-close-btn" onClick={() => setShowRules(null)}>✕</button>
            </div>
          </div>
          <textarea className="pb-rules-textarea" value={rulesEdit} onChange={e => setRulesEdit(e.target.value)} />
        </div>
      )}

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
