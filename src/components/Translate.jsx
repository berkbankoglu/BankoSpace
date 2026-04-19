import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Translate.css';
import './ProjectBid.css';

export default function Translate() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [rules, setRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem('translate_rules') || '[]'); } catch { return []; }
  });
  const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState('');

  const translate = async (text) => {
    if (!text.trim()) { setOutputText(''); setDirection(''); return; }
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setError('API key required - Settings - AI'); return; }

    setLoading(true);
    setError('');

    try {
      const savedRules = (() => { try { return JSON.parse(localStorage.getItem('translate_rules') || '[]'); } catch { return []; } })();
      const rulesSection = savedRules.length > 0
        ? '\n\nExtra rules:\n' + savedRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
        : '';

      const prompt = `You are a smart translator between Turkish and English. Detect the language of the text below. If it is Turkish, translate to English. If it is any other language, translate to Turkish.

Do NOT do a word-for-word translation. Instead: understand the meaning, fix any grammar mistakes or awkward phrasing in the source, then produce a natural, fluent, idiomatic translation that reads as if it were originally written in the target language.

Output ONLY the final translated text. No explanations, no labels, no commentary.${rulesSection}

Text: ${text}`;

      const body = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
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
      const hasTurkish = /[şğıöüçŞĞİÖÜÇ]/.test(text);
      setDirection(hasTurkish ? 'TR → EN' : 'EN → TR');
    } catch (e) {
      setError('Translation failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      translate(inputText);
    }
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

  return (
    <div className="pb-container">
      <div className="pb-header">
        <h2 className="pb-title">Translate</h2>
        <button
          className={`pb-rules-btn ${rules.length > 0 ? 'tr-has-rules' : ''}`}
          onClick={() => setShowRules(s => !s)}
        >
          Rules {rules.length > 0 ? `(${rules.length})` : ''}
        </button>
      </div>

      {showRules && (
        <div className="pb-rules-panel">
          <div className="pb-rules-header">
            <span className="pb-rules-title">Translation Rules</span>
            <button className="pb-close-btn" onClick={() => setShowRules(false)}>x</button>
          </div>
          <div className="tr-rules-list">
            {rules.length === 0 && <span className="tr-rules-empty">No rules yet</span>}
            {rules.map((r, i) => (
              <div key={i} className="tr-rule-item">
                <span>{r}</span>
                <button className="tr-rule-remove" onClick={() => removeRule(i)}>x</button>
              </div>
            ))}
          </div>
          <div className="tr-rules-add">
            <input
              className="tr-rules-input"
              placeholder="e.g. Keep technical terms in English"
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRule(); }}
            />
            <button className="pb-save-btn" onClick={addRule}>Add</button>
          </div>
        </div>
      )}

      <div className="pb-main-row">
        <div className="pb-left">
          <div className="pb-action-row">
            <button
              className="pb-action-btn pb-bid-btn"
              onClick={() => translate(inputText)}
              disabled={loading || !inputText.trim()}
            >
              {loading ? <><span className="pb-spinner" /> Translating...</> : 'Translate'}
            </button>
            {inputText && (
              <button
                className="pb-action-btn pb-analyze-btn"
                onClick={() => { setInputText(''); setOutputText(''); setDirection(''); setError(''); }}
                style={{ flex: '0 0 auto', padding: '12px 20px' }}
              >
                Clear
              </button>
            )}
          </div>

          {error && <div className="pb-error">{error}</div>}

          <div className="pb-field pb-field-grow">
            <label className="pb-label">Text <span className="pb-optional">(Enter = translate, Shift+Enter = new line)</span></label>
            <textarea
              className="pb-textarea pb-details"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type or paste — Turkish becomes English, anything else becomes Turkish"
              spellCheck={false}
              autoFocus
            />
          </div>
        </div>

        <div className="pb-right">
          <div className="pb-result-header">
            <span className="pb-result-title">{direction || 'Auto'}</span>
            {outputText && (
              <button className="pb-copy-btn" onClick={copyOutput}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="pb-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            </div>
          ) : outputText ? (
            <div className="pb-summary-body">
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 15, color: '#c9d1d9' }}>{outputText}</div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: 13 }}>
              Translation will appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
