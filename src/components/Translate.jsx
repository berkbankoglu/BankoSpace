import { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Translate.css';

const LANGUAGES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'İngilizce' },
  { code: 'de', label: 'Almanca' },
  { code: 'fr', label: 'Fransızca' },
  { code: 'es', label: 'İspanyolca' },
  { code: 'it', label: 'İtalyanca' },
  { code: 'pt', label: 'Portekizce' },
  { code: 'ru', label: 'Rusça' },
  { code: 'ja', label: 'Japonca' },
  { code: 'zh', label: 'Çince' },
  { code: 'ko', label: 'Korece' },
  { code: 'ar', label: 'Arapça' },
  { code: 'nl', label: 'Hollandaca' },
  { code: 'pl', label: 'Lehçe' },
  { code: 'sv', label: 'İsveççe' },
];

export default function Translate() {
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('tr');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const getLangLabel = (code) => LANGUAGES.find(l => l.code === code)?.label || code;

  const translate = useCallback(async (text, src, tgt) => {
    if (!text.trim()) { setOutputText(''); return; }
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setError('API key gerekli → Ayarlar → Yapay Zeka'); return; }

    setLoading(true);
    setError('');

    try {
      const isShortInput = text.trim().split(/\s+/).length <= 6;
      const body = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: isShortInput
            ? `Translate the following word or short phrase from ${getLangLabel(src)} to ${getLangLabel(tgt)}.

Respond in this exact format (no extra text):
**Çeviri:** <translation>
**Anlam:** <brief explanation of meaning/usage in 1 sentence, in Turkish>
**Örnek:** <one natural example sentence in ${getLangLabel(tgt)}, then its ${getLangLabel(src)} translation in parentheses>

Text: ${text}`
            : `Translate the following text from ${getLangLabel(src)} to ${getLangLabel(tgt)}.

Respond in this exact format:
**Çeviri:**
<full translation>

**Not:** <one brief note about tone, register, or key word choices if useful, in Turkish — skip if not helpful>

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
      setError('Çeviri başarısız: ' + (e?.message || 'Bilinmeyen hata'));
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
    const prevSource = sourceLang;
    const prevTarget = targetLang;
    const prevInput = inputText;
    const prevOutput = outputText;
    setSourceLang(prevTarget);
    setTargetLang(prevSource);
    setInputText(prevOutput);
    setOutputText(prevInput);
  };

  const handleSourceLangChange = (lang) => {
    setSourceLang(lang);
  };

  const handleTargetLangChange = (lang) => {
    setTargetLang(lang);
  };

  const copyOutput = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderOutput = (text) => {
    return text.split('\n').map((line, i) => {
      // **Label:** value → bold label
      const match = line.match(/^\*\*(.+?)\*\*:(.*)$/);
      if (match) {
        return (
          <div key={i} className="tr-output-line">
            <span className="tr-output-label">{match[1]}:</span>
            <span>{match[2]}</span>
          </div>
        );
      }
      return <div key={i} className="tr-output-line">{line || <br />}</div>;
    });
  };

  return (
    <div className="tr-wrap">
      {/* Lang bar */}
      <div className="tr-langbar">
        <select className="tr-lang-select" value={sourceLang} onChange={(e) => handleSourceLangChange(e.target.value)}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>

        <button className="tr-swap" onClick={handleSwap} title="Dilleri değiştir">⇄</button>

        <select className="tr-lang-select" value={targetLang} onChange={(e) => handleTargetLangChange(e.target.value)}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Panels */}
      <div className="tr-panels">
        {/* Input panel */}
        <div className="tr-panel tr-panel-input">
          <textarea
            className="tr-textarea"
            placeholder="Metni buraya yazın, Enter ile çevirin..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          <div className="tr-footer">
            <span className="tr-hint">Enter → çevir &nbsp;·&nbsp; Shift+Enter → yeni satır</span>
            <div className="tr-footer-actions">
              <span className="tr-charcount">{inputText.length}</span>
              {inputText && (
                <button className="tr-btn" onClick={() => { setInputText(''); setOutputText(''); setError(''); }}>
                  Temizle
                </button>
              )}
              <button
                className="tr-btn tr-btn-primary"
                onClick={() => translate(inputText, sourceLang, targetLang)}
                disabled={loading || !inputText.trim()}
              >
                {loading ? <span className="tr-spinner" /> : 'Çevir'}
              </button>
            </div>
          </div>
        </div>

        <div className="tr-divider" />

        {/* Output panel */}
        <div className="tr-panel tr-panel-output">
          {loading ? (
            <div className="tr-loading"><span className="tr-spinner tr-spinner-lg" /></div>
          ) : (
            <div className="tr-output">
              {outputText
                ? renderOutput(outputText)
                : <span className="tr-empty">Çeviri burada görünecek...</span>
              }
            </div>
          )}
          <div className="tr-footer">
            <span className="tr-charcount">{outputText.length}</span>
            {outputText && (
              <button className="tr-btn" onClick={copyOutput}>
                {copied ? 'Kopyalandı ✓' : 'Kopyala'}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="tr-error">{error}</div>}
    </div>
  );
}
