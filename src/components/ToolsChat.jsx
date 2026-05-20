import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

const DEFAULT_ANALYZE_RULES = `- İngilizce proje açıklamasını analiz et
- Türkçe olarak sadece ne yapmam gerektiğini 2-3 cümleyle özetle
- Başka hiçbir bilgi verme (görev listesi, bütçe, zorluk vs. yazma)
- Sade ve doğrudan yaz`;

const DEFAULT_BID_RULES = `**TEKLİF YAZMA KURALLARI**

- **MAX 30 KELİME — kesinlikle aşma. Yazmadan önce say, 20'yi geçiyorsa kıs.**
- Tek paragraf, max 2 satır, kopyalamaya hazır
- Her zaman İngilizce yaz
- Açılışta kısa onay ifadesi kullan — sanki projesini okuyup onaylıyormuşsun gibi (örn. "Yes!", "Absolutely!", "Perfect!")
- Selamdan hemen sonra HOOK kur — hemen şimdi başlayabileceğini ve en kısa sürede teslim edeceğini vurgula
- Problemi normalize et — "bu çok normal, kolayca hallederim" havasında devam et
- Bu tür işleri rutin olarak yaptığını belirt — özgüvenli ve samimi ton
- Yapacaklarını tek tek veya madde madde yazma — genel ve geniş konuş
- Bilmediğin veya projede yazmayan detaylar hakkında asla yorum yapma
- Müşterinin kullandığı kelimeleri tekrarlama
- Aynı anlama gelen ifadeleri tekrarlama
- Sona boşluk bırakıp şunu ekle: \`Kind regards,\` \`Berk\`

ÖRNEK TEKLİF YAZISI:
"Evet bu tip hataların olması çok normal, eğer simdi bana ulaşırsan hemen bu sıkıntılı noktaları düzeltebilirim. Bu tip işleri günlük işlerimde sürekli yapıyorum benim için çocuk oyuncağı ^^ Senden haber bekliyorum Berk"

Output only the letter, nothing else.`;

function getLangLabel(code) {
  return LANGUAGES.find(l => l.code === code)?.label || code;
}

async function callAI(prompt, maxTokens = 1000) {
  let key = localStorage.getItem('anthropic_api_key');
  if (!key) throw new Error('API key missing → Settings → AI');
  key = key.trim().replace(/^["']|["']$/g, '');
  if (!key.startsWith('sk-')) throw new Error('Invalid API key');
  const text = await invoke('fetch_post', {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
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
        if (ruleUpdate.action === 'add') ruleMsg = `Kural eklendi: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'remove') ruleMsg = `Kural kaldırıldı: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'replace') ruleMsg = `Kural güncellendi: "${ruleUpdate.new}"`;
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
            <div>Çevirmek istediğin metni yaz ve Enter'a bas</div>
            <div className="tc-empty-hint">Kural değiştirmek için yazabilirsin, örn. "bundan sonra resmi dil kullan"</div>
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
          placeholder="Metin gir veya kural söyle… (Enter → gönder, Shift+Enter → yeni satır)"
          rows={1}
        />
        <button className="tc-send-btn" onClick={send} disabled={!input.trim() || loading}>
          {loading ? <span className="tc-send-spinner" /> : '↑'}
        </button>
      </div>
    </div>
  );
}

// ── Shared rule chat hook ───────────────────────────────────────
function useRuleChat(storageKey, defaultRules) {
  const [rules, setRules] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    // If saved value matches old generic default, replace with new default
    if (!saved || saved.startsWith('Analyze project listings with these guidelines')) return defaultRules;
    return saved;
  });
  const saveRules = (val) => { setRules(val); localStorage.setItem(storageKey, val); };
  const applyUpdate = useCallback((ruleUpdate, current) => {
    let lines = current.split('\n');
    if (ruleUpdate.action === 'add' && ruleUpdate.rule) {
      lines = [...lines, `- ${ruleUpdate.rule}`];
    } else if (ruleUpdate.action === 'remove' && ruleUpdate.rule) {
      lines = lines.filter(l => !l.toLowerCase().includes(ruleUpdate.rule.toLowerCase()));
    } else if (ruleUpdate.action === 'replace' && ruleUpdate.old && ruleUpdate.new) {
      lines = lines.map(l => l.toLowerCase().includes(ruleUpdate.old.toLowerCase()) ? `- ${ruleUpdate.new}` : l);
    }
    const updated = lines.join('\n');
    saveRules(updated);
    return updated;
  }, []);
  return { rules, saveRules, applyUpdate };
}

// ── Analyze Chat ────────────────────────────────────────────────
function AnalyzeChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { rules, saveRules, applyUpdate } = useRuleChat('analyze_rules', DEFAULT_ANALYZE_RULES);
  const [rulesEdit, setRulesEdit] = useState(rules);
  const [showRules, setShowRules] = useState(false);
  const feedRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, loading]);

  const autoResize = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text }]);
    setLoading(true);
    try {
      // Kural komutu: kısa mesaj + kural anahtar kelimesi (proje metni uzunsa analiz yap)
      const isRuleCommand = text.split(/\s+/).length <= 20 && /kural|bundan sonra|hep |artık |from now on|always |never /i.test(text);
      let prompt, maxTokens;
      if (isRuleCommand) {
        prompt = `Sen bir proje analiz asistanısın. Kullanıcı analiz kuralları hakkında talimat verdi.\n\nKullanıcı: "${text}"\nMevcut kurallar:\n${rules}\n\nTürkçe yanıt ver. Kural değişikliğini kısa onayla.\n\nYanıtının sonuna ekle:\n[RULE_UPDATE: {"action":"add","rule":"<rule in English>"}]`;
        maxTokens = 400;
      } else {
        prompt = `Aşağıdaki proje açıklamasını analiz et ve kurallara kesinlikle uy.\n\n[Kurallar — bunları harfiyen uygula]\n${rules}\n\nProje açıklaması:\n${text}`;
        maxTokens = 1000;
      }
      const raw = await callAI(prompt, maxTokens);
      const { text: aiText, ruleUpdate } = parseRuleUpdate(raw);
      let ruleMsg = null;
      if (ruleUpdate) {
        applyUpdate(ruleUpdate, rules);
        if (ruleUpdate.action === 'add') ruleMsg = `Kural eklendi: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'remove') ruleMsg = `Kural kaldırıldı: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'replace') ruleMsg = `Kural güncellendi: "${ruleUpdate.new}"`;
      }
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: aiText, isRule: !!isRuleCommand, ruleMsg }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: `Error: ${e.message}`, isError: true }]);
    } finally { setLoading(false); }
  };

  const renderAnalysis = (text) =>
    text.split('\n').map((line, i) => {
      const match = line.match(/^\*\*(.+?)\*\*:(.*)$/);
      if (match) return <div key={i} className="tc-ai-row"><span className="tc-ai-label">{match[1]}:</span><span className="tc-ai-value">{match[2].trim()}</span></div>;
      if (line.trim().startsWith('-')) return <div key={i} className="tc-ai-bullet">{line.trim()}</div>;
      return line.trim() ? <div key={i} className="tc-ai-plain">{line}</div> : <div key={i} style={{ height: 6 }} />;
    });

  return (
    <div className="tc-chat">
      <div className="tc-topbar">
        <span className="tc-topbar-title">Project Analyzer</span>
        <div className="tc-topbar-actions">
          <button className="tc-rules-btn" onClick={() => { setRulesEdit(rules); setShowRules(s => !s); }}>⚙ Rules</button>
          {messages.length > 0 && <button className="tc-clear-btn" onClick={() => setMessages([])}>Clear</button>}
        </div>
      </div>
      {showRules && (
        <div className="tc-rules-panel">
          <div className="tc-rules-header">
            <span>Analysis Rules</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="tc-rules-add-btn" onClick={() => { saveRules(rulesEdit); setShowRules(false); }}>Save</button>
              <button className="tc-rules-close" onClick={() => setShowRules(false)}>✕</button>
            </div>
          </div>
          <textarea className="tc-rules-textarea" value={rulesEdit} onChange={e => setRulesEdit(e.target.value)} />
        </div>
      )}
      <div className="tc-feed" ref={feedRef}>
        {messages.length === 0 && (
          <div className="tc-empty">
            <div>Proje listesini yapıştır ve Enter'a bas</div>
            <div className="tc-empty-hint">Kural değiştirmek için yaz, örn. "her zaman Türkçe analiz et"</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`tc-msg-wrap ${msg.role}`}>
            {msg.role === 'user'
              ? <div className="tc-bubble tc-bubble-user"><div className="tc-bubble-text">{msg.text}</div></div>
              : <div className={`tc-bubble tc-bubble-ai ${msg.isError ? 'tc-bubble-error' : ''}`}>
                  <div className="tc-bubble-text">{msg.isError ? <span className="tc-err">{msg.text}</span> : renderAnalysis(msg.text)}</div>
                  {msg.ruleMsg && <div className="tc-rule-notice">✓ {msg.ruleMsg}</div>}
                  {!msg.isError && <button className="tc-copy-btn" onClick={() => navigator.clipboard.writeText(msg.text)}>Copy</button>}
                </div>
            }
          </div>
        ))}
        {loading && <div className="tc-msg-wrap ai"><div className="tc-bubble tc-bubble-ai tc-bubble-loading"><span className="tc-dot" /><span className="tc-dot" /><span className="tc-dot" /></div></div>}
      </div>
      <div className="tc-input-bar">
        <textarea ref={textareaRef} className="tc-input" value={input} onChange={e => { setInput(e.target.value); autoResize(e.target); }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Proje listesini yapıştır…" rows={1} />
        <button className="tc-send-btn" onClick={send} disabled={!input.trim() || loading}>{loading ? <span className="tc-send-spinner" /> : '↑'}</button>
      </div>
    </div>
  );
}

// ── Write Bid Chat ──────────────────────────────────────────────
function WriteBidChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [clientName, setClientName] = useState('');
  const [loading, setLoading] = useState(false);
  const { rules, saveRules, applyUpdate } = useRuleChat('bid_rules', DEFAULT_BID_RULES);
  const [rulesEdit, setRulesEdit] = useState(rules);
  const [showRules, setShowRules] = useState(false);
  const feedRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, loading]);

  const autoResize = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text, clientName }]);
    setLoading(true);
    try {
      const isRuleCommand = text.split(/\s+/).length <= 20 && /kural|bundan sonra|hep |artık |from now on|always |never /i.test(text);
      let prompt, maxTokens;
      if (isRuleCommand) {
        prompt = `Sen bir teklif yazma asistanısın. Kullanıcı teklif kuralları hakkında talimat verdi.\n\nKullanıcı: "${text}"\nMevcut kurallar:\n${rules}\n\nTürkçe yanıt ver. Kural değişikliğini kısa onayla.\n\nYanıtının sonuna ekle:\n[RULE_UPDATE: {"action":"add","rule":"<rule in English>"}]`;
        maxTokens = 400;
      } else {
        prompt = `You are an experienced Upwork freelancer. Write a bid proposal.\n\n[Bid Rules]\n${rules}\n\n[Client Name]\n${clientName.trim() || 'Not specified'}\n\n[Project Details]\n${text}\n\nWrite only the bid text, nothing else.`;
        maxTokens = 600;
      }
      const raw = await callAI(prompt, maxTokens);
      const { text: aiText, ruleUpdate } = parseRuleUpdate(raw);
      let ruleMsg = null;
      if (ruleUpdate) {
        applyUpdate(ruleUpdate, rules);
        if (ruleUpdate.action === 'add') ruleMsg = `Kural eklendi: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'remove') ruleMsg = `Kural kaldırıldı: "${ruleUpdate.rule}"`;
        else if (ruleUpdate.action === 'replace') ruleMsg = `Kural güncellendi: "${ruleUpdate.new}"`;
      }
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: aiText, isRule: !!isRuleCommand, ruleMsg }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: `Error: ${e.message}`, isError: true }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="tc-chat">
      <div className="tc-topbar">
        <input className="tc-client-input" placeholder="Client name (optional)" value={clientName} onChange={e => setClientName(e.target.value)} />
        <div className="tc-topbar-actions">
          <button className="tc-rules-btn" onClick={() => { setRulesEdit(rules); setShowRules(s => !s); }}>⚙ Rules</button>
          {messages.length > 0 && <button className="tc-clear-btn" onClick={() => setMessages([])}>Clear</button>}
        </div>
      </div>
      {showRules && (
        <div className="tc-rules-panel">
          <div className="tc-rules-header">
            <span>Bid Rules</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="tc-rules-add-btn" onClick={() => { saveRules(rulesEdit); setShowRules(false); }}>Save</button>
              <button className="tc-rules-close" onClick={() => setShowRules(false)}>✕</button>
            </div>
          </div>
          <textarea className="tc-rules-textarea" value={rulesEdit} onChange={e => setRulesEdit(e.target.value)} />
        </div>
      )}
      <div className="tc-feed" ref={feedRef}>
        {messages.length === 0 && (
          <div className="tc-empty">
            <div>Proje listesini yapıştır ve Enter'a bas</div>
            <div className="tc-empty-hint">Kural değiştirmek için yaz, örn. "bidleri daha kısa yaz"</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`tc-msg-wrap ${msg.role}`}>
            {msg.role === 'user'
              ? <div className="tc-bubble tc-bubble-user">
                  {msg.clientName && <div className="tc-bubble-meta">Client: {msg.clientName}</div>}
                  <div className="tc-bubble-text">{msg.text}</div>
                </div>
              : <div className={`tc-bubble tc-bubble-ai ${msg.isError ? 'tc-bubble-error' : ''}`}>
                  <div className="tc-bubble-text">{msg.isError ? <span className="tc-err">{msg.text}</span> : <span className="tc-bid-text">{msg.text}</span>}</div>
                  {msg.ruleMsg && <div className="tc-rule-notice">✓ {msg.ruleMsg}</div>}
                  {!msg.isError && <button className="tc-copy-btn" onClick={() => navigator.clipboard.writeText(msg.text)}>Copy</button>}
                </div>
            }
          </div>
        ))}
        {loading && <div className="tc-msg-wrap ai"><div className="tc-bubble tc-bubble-ai tc-bubble-loading"><span className="tc-dot" /><span className="tc-dot" /><span className="tc-dot" /></div></div>}
      </div>
      <div className="tc-input-bar">
        <textarea ref={textareaRef} className="tc-input" value={input} onChange={e => { setInput(e.target.value); autoResize(e.target); }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Proje listesini yapıştır…" rows={1} />
        <button className="tc-send-btn" onClick={send} disabled={!input.trim() || loading}>{loading ? <span className="tc-send-spinner" /> : '↑'}</button>
      </div>
    </div>
  );
}

// ── Main ToolsChat ──────────────────────────────────────────────
const TOPICS = [
  { id: 'translate',  label: 'Translate',    icon: '🌐' },
  { id: 'analyze',    label: 'Analyze',       icon: '🔍' },
  { id: 'writebid',   label: 'Write Bid',     icon: '✍️' },
];

export default function ToolsChat() {
  const [active, setActive] = useState('translate');

  return (
    <div className="tc-root">
      <div className="tc-sidebar">
        <div className="tc-sidebar-title">Tools</div>
        {TOPICS.map(t => (
          <button
            key={t.id}
            className={`tc-sidebar-item ${active === t.id ? 'active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            <span className="tc-sidebar-icon">{t.icon}</span>
            <span className="tc-sidebar-label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="tc-content">
        {active === 'translate' && <TranslateChat />}
        {active === 'analyze'   && <AnalyzeChat />}
        {active === 'writebid'  && <WriteBidChat />}
      </div>
    </div>
  );
}
