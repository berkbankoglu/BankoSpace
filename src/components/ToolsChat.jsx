import { useState, useRef, useEffect, useCallback } from 'react';
import { proxyFetch } from '../platform';
import './ToolsChat.css';

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

function getLangLabel(code) {
  return LANGUAGES.find(l => l.code === code)?.label || code;
}

async function callAI(prompt, maxTokens = 1000) {
  let key = localStorage.getItem('anthropic_api_key');
  if (!key) throw new Error('API key missing → Settings → AI');
  key = key.trim().replace(/^["']|["']$/g, '');
  if (!key.startsWith('sk-')) throw new Error('Invalid API key');
  const text = await proxyFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text.trim();
}

// Extracts optional RULE_UPDATE block from AI response
// Returns { text: string, ruleUpdate: { action, rule } | null }
function parseRuleUpdate(raw) {
  const match = raw.match(/\[RULE_UPDATE:\s*(\{.*?\})\]/s);
  if (!match) return { text: raw, ruleUpdate: null };
  try {
    const ruleUpdate = JSON.parse(match[1]);
    const text = raw.replace(match[0], '').trim();
    return { text, ruleUpdate };
  } catch {
    return { text: raw, ruleUpdate: null };
  }
}

// ── Translate Chat ──────────────────────────────────────────────
function TranslateChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('tr');
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem('translate_rules') || '[]'); } catch { return []; }
  });
  const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState('');
  const feedRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, loading]);

  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const applyRuleUpdate = useCallback((ruleUpdate, currentRules) => {
    let updated = [...currentRules];
    if (ruleUpdate.action === 'add' && ruleUpdate.rule) {
      if (!updated.includes(ruleUpdate.rule)) updated = [...updated, ruleUpdate.rule];
    } else if (ruleUpdate.action === 'remove' && ruleUpdate.rule) {
      updated = updated.filter(r => !r.toLowerCase().includes(ruleUpdate.rule.toLowerCase()));
    } else if (ruleUpdate.action === 'replace' && ruleUpdate.old && ruleUpdate.new) {
      updated = updated.map(r => r.toLowerCase().includes(ruleUpdate.old.toLowerCase()) ? ruleUpdate.new : r);
    }
    setRules(updated);
    localStorage.setItem('translate_rules', JSON.stringify(updated));
    return updated;
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
    const userMsg = { id: Date.now(), role: 'user', text, src: sourceLang, tgt: targetLang };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const currentRules = (() => { try { return JSON.parse(localStorage.getItem('translate_rules') || '[]'); } catch { return []; } })();
      const rulesSection = currentRules.length > 0
        ? `\nCurrent rules:\n${currentRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : '\nNo rules yet.';

      const isShort = text.split(/\s+/).length <= 6;
      const isRuleCommand = text.split(/\s+/).length <= 20 && /kural|bundan sonra|hep |artık |from now on|always |never /i.test(text);

      const prompt = isRuleCommand
        ? `You are a translation assistant. The user sent an instruction (not a translation request).

User message: "${text}"
${rulesSection}

Respond conversationally in the same language as the user's message. If the user wants to add, remove, or change a translation rule, do it and confirm.

After your response, if you updated the rules, append exactly this on a new line:
[RULE_UPDATE: {"action":"add","rule":"<the new rule in English>"}]

Possible actions: "add", "remove" (with "rule" being a keyword to match), "replace" (with "old" and "new" fields).
Only append RULE_UPDATE if an actual rule change was requested.`
        : isShort
        ? `Translate from ${getLangLabel(sourceLang)} to ${getLangLabel(targetLang)}.
${rulesSection}

If the user's message contains a rule change instruction alongside the translation, append [RULE_UPDATE: {...}] after your translation.

Respond in this exact format:
**Translation:** <translation>
**Meaning:** <brief explanation in 1 sentence>
**Example:** <example in ${getLangLabel(targetLang)}, then ${getLangLabel(sourceLang)} in parentheses>

Text: ${text}`
        : `Translate from ${getLangLabel(sourceLang)} to ${getLangLabel(targetLang)}.
${rulesSection}

If the user's message contains a rule change instruction, append [RULE_UPDATE: {...}] after your translation.

Respond in this exact format:
**Translation:**
<full translation>

**Note:** <one brief note if useful, otherwise omit>

Text: ${text}`;

      const raw = await callAI(prompt, 2048);
      const { text: aiText, ruleUpdate } = parseRuleUpdate(raw);

      let ruleMsg = null;
      if (ruleUpdate) {
        const updatedRules = applyRuleUpdate(ruleUpdate, currentRules);
        if (ruleUpdate.action === 'add') ruleMsg = `Rule added: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'remove') ruleMsg = `Rule removed: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'replace') ruleMsg = `Rule updated: "${ruleUpdate.new}"`;
      }

      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'ai', text: aiText, src: sourceLang, tgt: targetLang, ruleMsg },
      ]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: `Error: ${e.message}`, isError: true }]);
    } finally {
      setLoading(false);
    }
  }, [input, sourceLang, targetLang, loading, applyRuleUpdate]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const addRule = () => {
    const t = newRule.trim();
    if (!t) return;
    const updated = [...rules, t];
    setRules(updated);
    localStorage.setItem('translate_rules', JSON.stringify(updated));
    setNewRule('');
  };

  const removeRule = (i) => {
    const updated = rules.filter((_, idx) => idx !== i);
    setRules(updated);
    localStorage.setItem('translate_rules', JSON.stringify(updated));
  };

  const renderAiText = (text) =>
    text.split('\n').map((line, i) => {
      const match = line.match(/^\*\*(.+?)\*\*:?(.*)$/);
      if (match) return (
        <div key={i} className="tc-ai-row">
          <span className="tc-ai-label">{match[1]}:</span>
          <span className="tc-ai-value">{match[2].trim()}</span>
        </div>
      );
      return line.trim() ? <div key={i} className="tc-ai-plain">{line}</div> : <div key={i} style={{ height: 6 }} />;
    });

  return (
    <div className="tc-chat">
      <div className="tc-topbar">
        <div className="tc-lang-row">
          <select className="tc-lang-select" value={sourceLang} onChange={e => setSourceLang(e.target.value)}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button className="tc-swap-btn" onClick={() => { setSourceLang(targetLang); setTargetLang(sourceLang); }} title="Swap">⇄</button>
          <select className="tc-lang-select" value={targetLang} onChange={e => setTargetLang(e.target.value)}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div className="tc-topbar-actions">
          <button className={`tc-rules-btn ${rules.length > 0 ? 'has-rules' : ''}`} onClick={() => setShowRules(s => !s)}>
            ⚙ Rules {rules.length > 0 ? `(${rules.length})` : ''}
          </button>
          {messages.length > 0 && (
            <button className="tc-clear-btn" onClick={() => setMessages([])}>Clear</button>
          )}
        </div>
      </div>

      {showRules && (
        <div className="tc-rules-panel">
          <div className="tc-rules-header">
            <span>Translation Rules</span>
            <button className="tc-rules-close" onClick={() => setShowRules(false)}>✕</button>
          </div>
          <div className="tc-rules-list">
            {rules.length === 0 && <span className="tc-rules-empty">No rules yet</span>}
            {rules.map((r, i) => (
              <div key={i} className="tc-rule-item">
                <span>{r}</span>
                <button className="tc-rule-remove" onClick={() => removeRule(i)}>×</button>
              </div>
            ))}
          </div>
          <div className="tc-rules-add">
            <input
              className="tc-rules-input"
              placeholder="Add rule..."
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRule(); }}
            />
            <button className="tc-rules-add-btn" onClick={addRule}>Add</button>
          </div>
        </div>
      )}

      <div className="tc-feed" ref={feedRef}>
        {messages.length === 0 && (
          <div className="tc-empty">
            <div>Type the text you want to translate and press Enter</div>
            <div className="tc-empty-hint">You can type to change a rule, e.g. "use formal language from now on"</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`tc-msg-wrap ${msg.role}`}>
            {msg.role === 'user' ? (
              <div className="tc-bubble tc-bubble-user">
                <div className="tc-bubble-meta">{getLangLabel(msg.src)} → {getLangLabel(msg.tgt)}</div>
                <div className="tc-bubble-text">{msg.text}</div>
              </div>
            ) : (
              <div className={`tc-bubble tc-bubble-ai ${msg.isError ? 'tc-bubble-error' : ''}`}>
                {msg.isError
                  ? <div className="tc-bubble-text tc-err">{msg.text}</div>
                  : <div className="tc-bubble-text">{renderAiText(msg.text)}</div>
                }
                {msg.ruleMsg && (
                  <div className="tc-rule-notice">✓ {msg.ruleMsg}</div>
                )}
                {!msg.isError && (
                  <button className="tc-copy-btn" onClick={() => navigator.clipboard.writeText(msg.text)}>Copy</button>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="tc-msg-wrap ai">
            <div className="tc-bubble tc-bubble-ai tc-bubble-loading">
              <span className="tc-dot" /><span className="tc-dot" /><span className="tc-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="tc-input-bar">
        <textarea
          ref={textareaRef}
          className="tc-input"
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(e.target); }}
          onKeyDown={handleKeyDown}
          placeholder="Enter text or state a rule… (Enter → send, Shift+Enter → new line)"
          rows={1}
        />
        <button className="tc-send-btn" onClick={send} disabled={!input.trim() || loading}>
          {loading ? <span className="tc-send-spinner" /> : '↑'}
        </button>
      </div>
    </div>
  );
}

// ── Main ToolsChat ──────────────────────────────────────────────
export default function ToolsChat() {
  return (
    <div className="tc-root">
      <div className="tc-content">
        <TranslateChat />
      </div>
    </div>
  );
}
