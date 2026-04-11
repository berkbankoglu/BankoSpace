import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Translate.css';
import './ProjectBid.css';

const LANGUAGES = [
  { code: 'tr', label: 'Turkish' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
];

export default function Translate() {
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('tr');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [rules, setRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem('translate_rules') || '[]'); } catch { return []; }
  });
  const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState('');

  const getLangLabel = (code) => LANGUAGES.find(l => l.code === code)?.label || code;

  const translate = useCallback(async (text, src, tgt) => {
    if (!text.trim()) { setOutputText(''); return; }
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setError('API key required → Settings → AI'); return; }

    setLoading(true);
    setError('');

    try {
      const savedRules = (() => { try { return JSON.parse(localStorage.getItem('translate_rules') || '[]'); } catch { return []; } })();
      const rulesSection = savedRules.length > 0
        ? `\n\nTranslation rules to follow:\n${savedRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : '';
      const body = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Translate the following text from ${getLangLabel(src)} to ${getLangLabel(tgt)}. Make it natural and fluent — fix grammar mistakes, awkward phrasing, and typos in the source if any, then produce a clean idiomatic translation. Output ONLY the translated text, no explanations, no labels, no extra commentary.${rulesSection}

Text: ${text}`
        }]
      });

      const result = await invoke('fetch_post', {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body,
      });

      const data = JSON.parse(result);
      if (data.error) throw new Error(data.error.message);
      setOutputText(data.content[0].text.trim());
    } catch (e) {
      setError('Translation failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      translate(inputText, sourceLang, targetLang);
    }
  };

  const handleSwap = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(outputText);
    setOutputText(inputText);
  };

  const copyOutput = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const addRule = () => {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    const updated = [...rules, trimmed];
    setRules(updated);
    localStorage.setItem('translate_rules', JSON.stringify(updated));
    setNewRule('');
  };

  const removeRule = (i) => {
    const updated = rules.filter((_, idx) => idx !== i);
    setRules(updated);
    localStorage.setItem('translate_rules', JSON.stringify(updated));
  };

  const renderOutput = (text) => (
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 15, color: '#c9d1d9' }}>{text}</div>
  );

  return (
    <div className="pb-container">
      {/* Header */}
      <div className="pb-header">
        <h2 className="pb-title">Translate</h2>
        <button
          className={`pb-rules-btn ${rules.length > 0 ? 'tr-has-rules' : ''}`}
          onClick={() => setShowRules(s => !s)}
        >
          ⚙ Rules {rules.length > 0 ? `(${rules.length})` : ''}
        </button>
      </div>

      {/* Rules panel */}
      {showRules && (
        <div className="pb-rules-panel">
          <div className="pb-rules-header">
            <span className="pb-rules-title">Translation Rules</span>
            <button className="pb-close-btn" onClick={() => setShowRules(false)}>✕</button>
          </div>
          <div className="tr-rules-list">
            {rules.length === 0 && <span className="tr-rules-empty">No rules yet</span>}
            {rules.map((r, i) => (
              <div key={i} className="tr-rule-item">
                <span>{r}</span>
                <button className="tr-rule-remove" onClick={() => removeRule(i)}>×</button>
              </div>
            ))}
          </div>
          <div className="tr-rules-add">
            <input
              className="tr-rules-input"
              placeholder="Add a new rule... (e.g. Keep technical terms in English)"
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRule(); }}
            />
            <button className="pb-save-btn" onClick={addRule}>Add</button>
          </div>
        </div>
      )}

      {/* Main row */}
      <div className="pb-main-row">
        {/* Left: controls + input */}
        <div className="pb-left">
          {/* Lang selector + action buttons */}
          <div className="tr-lang-row">
            <select className="pb-input tr-lang-select-pb" value={sourceLang} onChange={e => setSourceLang(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <button className="pb-rules-btn tr-swap-pb" onClick={handleSwap} title="Swap languages">⇄</button>
            <select className="pb-input tr-lang-select-pb" value={targetLang} onChange={e => setTargetLang(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          <div className="pb-action-row">
            <button
              className="pb-action-btn pb-bid-btn"
              onClick={() => translate(inputText, sourceLang, targetLang)}
              disabled={loading || !inputText.trim()}
            >
              {loading ? <><span className="pb-spinner" /> Translating...</> : 'Translate'}
            </button>
            {inputText && (
              <button
                className="pb-action-btn pb-analyze-btn"
                onClick={() => { setInputText(''); setOutputText(''); setError(''); }}
                style={{ flex: '0 0 auto', padding: '12px 20px' }}
              >
                Clear
              </button>
            )}
          </div>

          {error && <div className="pb-error">{error}</div>}

          <div className="pb-field pb-field-grow">
            <label className="pb-label">Text <span className="pb-optional">(Enter → translate · Shift+Enter → new line)</span></label>
            <textarea
              className="pb-textarea pb-details"
              value={inputText}
              onChange={e => { setInputText(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder="Enter text to translate..."
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right: output */}
        {(outputText || loading) && (
          <div className="pb-right">
            <div className="pb-result-header">
              <span className="pb-result-title">{getLangLabel(sourceLang)} → {getLangLabel(targetLang)}</span>
              {outputText && (
                <button className="pb-copy-btn" onClick={copyOutput}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              )}
            </div>
            {loading ? (
              <div className="pb-summary-body" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <span className="pb-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : (
              <div className="pb-summary-body">{renderOutput(outputText)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
