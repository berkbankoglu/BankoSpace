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
      setError('API key not found. Please enter your Anthropic API key in Settings > API key.');
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
          content: `You are an experienced Upwork freelancer. Write a bid proposal for the following project.\n\n[Bid Rules]\n${bidRules}\n\n[Client Name]\n${clientName.trim() || 'Not specified'}\n\n[Project Details]\n${projectDetails}\n\nWrite only the bid text, nothing else.`,
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
      setError(e.message || 'Failed to generate bid.');
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
          ⚙ Rules
        </button>
      </div>

      {showRules && (
        <div className="pb-rules-panel">
          <div className="pb-rules-header">
            <span className="pb-rules-title">Bid Rules</span>
            <div className="pb-rules-actions">
              <button className="pb-save-btn" onClick={saveRules}>Save</button>
              <button className="pb-close-btn" onClick={() => setShowRules(false)}>✕</button>
            </div>
          </div>
          <textarea
            className="pb-rules-textarea"
            value={rulesEdit}
            onChange={e => setRulesEdit(e.target.value)}
            placeholder="Enter bid writing rules here..."
          />
        </div>
      )}

      <div className="pb-form">
        <div className="pb-field">
          <label className="pb-label">Client Name <span className="pb-optional">(optional)</span></label>
          <input
            className="pb-input"
            type="text"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            placeholder="Client name..."
          />
        </div>

        <div className="pb-field">
          <label className="pb-label">Project Details</label>
          <textarea
            className="pb-textarea pb-details"
            value={projectDetails}
            onChange={e => setProjectDetails(e.target.value)}
            placeholder="Paste the Upwork listing or project description here..."
          />
        </div>

        <button
          className="pb-generate-btn"
          onClick={generateBid}
          disabled={loading || !projectDetails.trim()}
        >
          {loading ? <><span className="pb-spinner" /> Generating...</> : 'Generate Bid →'}
        </button>

        {error && <div className="pb-error">{error}</div>}
      </div>

      {generatedBid && (
        <div className="pb-result">
          <div className="pb-result-header">
            <span className="pb-result-title">Generated Bid</span>
            <button className="pb-copy-btn" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy'}
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
