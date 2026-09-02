import { useState, useEffect, useRef, useCallback } from 'react';
import { proxyFetch } from '../platform';
import './FlashCards.css';
import { pushKeyToSupabase } from '../supabase';
import { playTypeSoundThrottled, playClickSound, playAddSound, playDeleteSound, playCompleteSound, playUncompleteSound } from '../utils/sounds';

// Marks you put on a card yourself, replacing the automatic New/Learning/
// Mastered status: what "needs work" means is a judgement, and the point is
// being able to drill just the reds, or just the yellows.
const CARD_MARKS = [
  { id: 'red',    hex: '#f85149', label: 'Needs work' },
  { id: 'yellow', hex: '#d29922', label: 'Shaky' },
  { id: 'green',  hex: '#3fb950', label: 'Solid' },
];

const DECK_COLORS = [
  '#5c7cfa', '#7ee787', '#f85149', '#d29922', '#bc8cff',
  '#ff7b72', '#79c0ff', '#ffa657', '#f778ba', '#3fb950'
];

function FlashCards({ fullscreen = false }) {
  const [cards, setCards] = useState(() => {
    const saved = localStorage.getItem('flashCards');
    if (saved) {
      return JSON.parse(saved).map(card => ({
        ...card,
        group: card.group || 'General',
        known: card.known !== undefined ? card.known : null,
      }));
    }
    return [];
  });
  const [decks, setDecks] = useState(() => {
    const saved = localStorage.getItem('flashCardGroups');
    if (saved) {
      const loaded = JSON.parse(saved);
      if (loaded.length > 0 && typeof loaded[0] === 'string') {
        return loaded.map((name, idx) => ({ name, color: DECK_COLORS[idx % DECK_COLORS.length] }));
      }
      return loaded;
    }
    return [];
  });
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [activeView, setActiveView] = useState('decks'); // 'decks', 'cards', 'study', 'practice', 'results'
  const [editingCard, setEditingCard] = useState(null);
  const [editingDeckName, setEditingDeckName] = useState(null);
  const [editingDeckTitle, setEditingDeckTitle] = useState('');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyStats, setStudyStats] = useState({ known: 0, unknown: 0 });
  const [shuffledCards, setShuffledCards] = useState([]);
  // Practice mode: type the answer instead of self-rating a flip. Same drilling
  // mechanic the kana Practice tab uses — a card you miss comes back a few
  // cards later, and the round only ends once everything has been answered
  // right once.
  // Cards ticked in the table. Empty means "no filter" — study and practice
  // then run over the whole deck, which is the common case.
  const [selectedCardIds, setSelectedCardIds] = useState(() => new Set());
  // Empty means every colour, including unmarked.
  const [markFilter, setMarkFilter] = useState(() => new Set());
  const [practiceDirection, setPracticeDirection] = useState(() => localStorage.getItem('fc_practice_dir') || 'front');
  const [practiceCard, setPracticeCard] = useState(null);
  const [practiceInput, setPracticeInput] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState(null); // null | 'correct' | 'wrong'
  const [practiceStreak, setPracticeStreak] = useState(0);
  const [practiceStats, setPracticeStats] = useState({ correct: 0, wrong: 0, total: 0 });
  const practiceInputRef = useRef(null);
  const practiceContinueRef = useRef(null);
  const practiceUnseenRef = useRef([]);
  const practiceWrongRef = useRef([]);
  const practiceCountRef = useRef(0);
  const practiceLastRef = useRef(null);
  // The set this session drills, fixed when it starts — refilling a cleared
  // round must not read live filter state through a stale closure.
  const practicePoolRef = useRef([]);
  const practiceTimerRef = useRef(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [showNewDeckInput, setShowNewDeckInput] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(null);

  // AI state
  const [aiWord, setAiWord] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [aiMode, setAiMode] = useState('single'); // 'single' | 'bulk' | 'image'
  const [bulkPrompt, setBulkPrompt] = useState('');
  const [bulkResults, setBulkResults] = useState(null); // array of {front, back}
  const [aiPanelHeight, setAiPanelHeight] = useState(() => {
    return parseInt(localStorage.getItem('fc_ai_panel_height') || '340', 10);
  });
  const sidebarRef = useRef(null);
  const isResizingRef = useRef(false);

  // Image → word extraction state (görseldeki Japonca kelime notlarını çıkar)
  const [aiImages, setAiImages] = useState([]); // [{dataUrl, mediaType}]
  const [imageResults, setImageResults] = useState(null); // [{writing, reading, turkish, corrected}]
  const imageFileRef = useRef(null);
  // Görsel çıktısının hangi desteye ekleneceği — mevcut deste veya yeni bir deste
  const [imageTargetDeck, setImageTargetDeck] = useState('');
  const [imageNewDeckName, setImageNewDeckName] = useState('');

  // Study kartı büyüklüğü — kullanıcı +/- ile ayarlıyor
  const [studyScale, setStudyScale] = useState(() => {
    return parseFloat(localStorage.getItem('fc_study_scale') || '1');
  });
  useEffect(() => {
    localStorage.setItem('fc_study_scale', String(studyScale));
  }, [studyScale]);

  // Reload from localStorage when flashcards-updated event fires (from QuickNote)
  useEffect(() => {
    const reloadFromStorage = () => {
      const savedCards = localStorage.getItem('flashCards');
      const savedDecks = localStorage.getItem('flashCardGroups');
      if (savedCards) {
        setCards(JSON.parse(savedCards).map(card => ({
          ...card,
          group: card.group || 'General',
          known: card.known !== undefined ? card.known : null,
        })));
      }
      if (savedDecks) {
        const loaded = JSON.parse(savedDecks);
        if (loaded.length > 0 && typeof loaded[0] === 'string') {
          setDecks(loaded.map((name, idx) => ({ name, color: DECK_COLORS[idx % DECK_COLORS.length] })));
        } else {
          setDecks(loaded);
        }
      }
    };
    window.addEventListener('flashcards-updated', reloadFromStorage);
    return () => window.removeEventListener('flashcards-updated', reloadFromStorage);
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem('flashCards', JSON.stringify(cards));
    pushKeyToSupabase('flashCards', cards);
  }, [cards]);

  useEffect(() => {
    localStorage.setItem('flashCardGroups', JSON.stringify(decks));
    pushKeyToSupabase('flashCardGroups', decks);
  }, [decks]);

  // Keyboard shortcuts for study mode
  useEffect(() => {
    if (activeView !== 'study') return;

    const handleKeyPress = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        handleKnown();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        handleUnknown();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        endStudy();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [activeView, currentCardIndex, shuffledCards]);

  // Helper functions
  const getAllDecks = () => {
    return decks;
  };

  const getDeckByName = (name) => {
    return decks.find(d => d.name === name);
  };

  const getDeckCards = (deckName = selectedDeck) =>
    cards.filter(c => c.group === deckName);

  const getDeckStats = (deckName) => {
    const deckCards = getDeckCards(deckName);
    const total = deckCards.length;
    const known = deckCards.filter(c => c.known === true).length;
    const unknown = deckCards.filter(c => c.known === false).length;
    const fresh = total - known - unknown;
    return { total, known, unknown, fresh };
  };

  // Deck operations
  const createDeck = () => {
    if (!newDeckName.trim()) return;

    const existing = decks.map(d => d.name);
    if (existing.includes(newDeckName.trim())) {
      alert('A deck with this name already exists');
      return;
    }

    const newDeck = {
      name: newDeckName.trim(),
      color: DECK_COLORS[decks.length % DECK_COLORS.length]
    };
    setDecks([...decks, newDeck]);
    setSelectedDeck(newDeckName.trim());
    setNewDeckName('');
    setShowNewDeckInput(false);
    setActiveView('cards');
    playAddSound();
  };

  const deleteDeck = (deckName) => {
    playDeleteSound();
    setCards(cards.filter(c => c.group !== deckName));
    setDecks(decks.filter(d => d.name !== deckName));
    if (selectedDeck === deckName) {
      setSelectedDeck(null);
      setActiveView('decks');
    }
  };

  const renameDeck = (oldName, newName) => {
    if (!newName || !newName.trim() || newName === oldName) return;
    const existing = decks.map(d => d.name);
    if (existing.includes(newName.trim())) {
      alert('A deck with this name already exists');
      return;
    }

    setCards(cards.map(c => c.group === oldName ? { ...c, group: newName.trim() } : c));
    setDecks(decks.map(d => d.name === oldName ? { ...d, name: newName.trim() } : d));
    if (selectedDeck === oldName) setSelectedDeck(newName.trim());
    setEditingDeckName(null);
    setEditingDeckTitle('');
  };

  const updateDeckColor = (deckName, color) => {
    setDecks(decks.map(d => d.name === deckName ? { ...d, color } : d));
    setShowColorPicker(null);
  };

  const resetDeckProgress = () => {
    setCards(cards.map(c => c.group === selectedDeck ? { ...c, known: null } : c));
  };

  // Card operations
  const addCard = (front, reading, back) => {
    if (!front.trim() || !back.trim()) return;

    const card = {
      id: Date.now(),
      front: front.trim(),
      reading: (reading || '').trim(),
      back: back.trim(),
      group: selectedDeck,
      known: null,
      createdAt: Date.now()
    };
    setCards([...cards, card]);
    setEditingCard(null);
    playAddSound();
  };

  const askAI = async () => {
    if (!aiWord.trim()) return;
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setShowApiKeyInput(true); return; }

    setAiLoading(true);
    setAiError(null);
    setAiResult(null);

    try {
      const bodyStr = JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Word/concept: "${aiWord}"\n\nRespond in this JSON format only (nothing else, just JSON):\n{"word":"original word/concept","translation":"short Turkish translation or equivalent (max 5 words)","explanation":"detailed Turkish explanation in 2-3 sentences, what it means and how it is used"}`
        }]
      });
      const text = await proxyFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: bodyStr,
      });
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error.message);
      const content = data.content[0].text.trim();
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
      setAiResult(parsed);
    } catch (e) {
      setAiError('AI failed to respond: ' + (e?.message || 'Unknown error'));
    } finally {
      setAiLoading(false);
    }
  };

  const addAiCardToFlashCards = () => {
    if (!aiResult) return;
    const targetDeck = selectedDeck || (decks[0]?.name ?? null);
    if (!targetDeck) { setAiError('Please select a deck first.'); return; }
    const card = {
      id: Date.now(),
      front: aiResult.word,
      back: (aiResult.translation ? `${aiResult.translation}\n\n` : '') + aiResult.explanation,
      group: targetDeck,
      known: null,
      createdAt: Date.now()
    };
    setCards(prev => [...prev, card]);
    playAddSound();
    setAiWord('');
    setAiResult(null);
    setAiError(null);
  };

  const generateBulk = async () => {
    if (!bulkPrompt.trim()) return;
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setShowApiKeyInput(true); return; }

    setAiLoading(true);
    setAiError(null);
    setBulkResults(null);

    try {
      const bodyStr = JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Create flash cards for: "${bulkPrompt}"\n\nRespond ONLY with a JSON array, no extra text. Each item must have "front" and "back" keys. Example:\n[{"front":"January","back":"Ocak"},{"front":"February","back":"Şubat"}]\n\nMake one card for EACH individual item. Do not combine multiple items into one card.`
        }]
      });
      const text = await proxyFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: bodyStr,
      });
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error.message);
      const content = data.content[0].text.trim();
      const arrStart = content.indexOf('[');
      const arrEnd = content.lastIndexOf(']');
      if (arrStart === -1 || arrEnd === -1) throw new Error('AI returned unexpected format');
      const parsed = JSON.parse(content.slice(arrStart, arrEnd + 1));
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No cards generated');
      setBulkResults(parsed);
    } catch (e) {
      setAiError('AI failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setAiLoading(false);
    }
  };

  const addAllBulkCards = () => {
    if (!bulkResults || bulkResults.length === 0) return;
    const targetDeck = selectedDeck || (decks[0]?.name ?? null);
    if (!targetDeck) { setAiError('Please select a deck first.'); return; }
    const now = Date.now();
    const newCards = bulkResults.map((item, i) => ({
      id: now + i,
      front: item.front,
      back: item.back,
      group: targetDeck,
      known: null,
      createdAt: now + i
    }));
    setCards(prev => [...prev, ...newCards]);
    playAddSound();
    setBulkPrompt('');
    setBulkResults(null);
    setAiError(null);
  };

  const saveApiKey = () => {
    if (apiKeyDraft.trim()) {
      localStorage.setItem('anthropic_api_key', apiKeyDraft.trim());
    }
    setShowApiKeyInput(false);
    setApiKeyDraft('');
  };

  const setCardMark = (cardId, mark) => {
    setCards(cards.map(c => (c.id === cardId ? { ...c, mark: c.mark === mark ? null : mark } : c)));
  };

  const toggleMarkFilter = (mark) => {
    setMarkFilter(prev => {
      const next = new Set(prev);
      if (next.has(mark)) next.delete(mark); else next.add(mark);
      return next;
    });
  };

  const updateCard = (cardId, front, reading, back) => {
    if (!front.trim() || !back.trim()) return;

    setCards(cards.map(c =>
      c.id === cardId
        ? { ...c, front: front.trim(), reading: (reading || '').trim(), back: back.trim() }
        : c
    ));
    setEditingCard(null);
  };

  // Görsel → base64 (Fitness AI görsel yükleme deseniyle aynı)
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFiles(files) {
    const imgs = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await fileToBase64(f);
      imgs.push({ dataUrl, mediaType: f.type });
    }
    if (imgs.length) setAiImages(prev => [...prev, ...imgs]);
  }

  // Görseldeki Japonca kelime notlarını (yazılış + okunuş + Türkçe) çıkar
  const extractFromImages = async () => {
    if (aiImages.length === 0) return;
    const key = localStorage.getItem('anthropic_api_key');
    if (!key) { setShowApiKeyInput(true); return; }

    setAiLoading(true);
    setAiError(null);
    setImageResults(null);

    try {
      const imageBlocks = aiImages.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.dataUrl.split(',')[1] },
      }));
      const prompt = `Bu görsel(ler)de Japonca kelime notları var — her kelimenin yazılışı (kanji/kana), okunuşu (furigana/romaji) ve Türkçe karşılığı yazılı. Hepsini çıkar.

Sen bir Japonca uzmanısın. Görselde yazılanı sadece kopyalama — her kelimenin
yazılışını, okunuşunu ve Türkçe karşılığını kendi bilgine göre DOĞRULA. Eğer
görseldeki Türkçe karşılık yanlışsa, eksikse veya okunuş hatalıysa, DOĞRUSUNU
yaz ve "corrected" alanını true yap. Kullanıcı bu kartlardan çalışıp
öğrenecek — yanlış bilgiyi asla olduğu gibi geçirme.

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
[{"writing":"漢字","reading":"かんじ","turkish":"Türkçe karşılığı","corrected":false}]

Kurallar:
- Görseldeki TÜM kelimeleri ekle, hiçbirini atlama
- writing: kelimenin Japonca yazılışı (kanji/kana), okunuş değil
- reading: kelimenin okunuşu (furigana/hiragana veya romaji, görselde nasıl yazılıysa) — bu da yanlışsa düzelt
- turkish: doğrulanmış/düzeltilmiş Türkçe karşılık
- corrected: görseldeki bilgiyi değiştirdiysen true, aynen doğruysa false`;

      const body = JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 2048,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
      });
      const result = await proxyFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body,
      });
      const data = JSON.parse(result);
      if (data.error) throw new Error(data.error.message);
      const raw = data.content.find(b => b.type === 'text')?.text || '';
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Failed to parse image: ' + raw.slice(0, 200));
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No words found in the image.');
      setImageResults(parsed);
      setImageTargetDeck(selectedDeck || decks[0]?.name || '');
      setImageNewDeckName('');
    } catch (e) {
      setAiError('Failed to process image: ' + (e?.message || 'Unknown error'));
    } finally {
      setAiLoading(false);
    }
  };

  const addAllImageCards = () => {
    if (!imageResults || imageResults.length === 0) return;

    let targetDeck = imageTargetDeck;
    let newDeckToCreate = null;
    if (targetDeck === '__new__') {
      const name = imageNewDeckName.trim();
      if (!name) { setAiError('Enter a name for the new deck.'); return; }
      if (decks.some(d => d.name === name)) { setAiError('A deck with this name already exists.'); return; }
      newDeckToCreate = { name, color: DECK_COLORS[decks.length % DECK_COLORS.length] };
      targetDeck = name;
    }
    if (!targetDeck) { setAiError('Select a deck to add to.'); return; }

    const now = Date.now();
    const newCards = imageResults.map((item, i) => ({
      id: now + i,
      front: item.writing || '',
      reading: item.reading || '',
      back: item.turkish || '',
      group: targetDeck,
      known: null,
      createdAt: now + i
    }));
    if (newDeckToCreate) setDecks(prev => [...prev, newDeckToCreate]);
    setCards(prev => [...prev, ...newCards]);
    playAddSound();
    setAiImages([]);
    setImageResults(null);
    setImageTargetDeck('');
    setImageNewDeckName('');
    setAiError(null);
    setSelectedDeck(targetDeck);
  };

  const deleteCard = (id) => {
    setCards(cards.filter(c => c.id !== id));
  };

  // A tick list is a filter over the deck, not a separate list: clearing it
  // falls straight back to studying everything.
  const getStudyPool = () => {
    let cards = getDeckCards();
    // Colour marks and ticks stack: mark first, then any explicit ticks.
    if (markFilter.size > 0) {
      const byMark = cards.filter(c => markFilter.has(c.mark || 'none'));
      if (byMark.length > 0) cards = byMark;
    }
    if (selectedCardIds.size === 0) return cards;
    const picked = cards.filter(c => selectedCardIds.has(c.id));
    return picked.length > 0 ? picked : cards;
  };

  const toggleCardSelected = (id) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (cards) => {
    setSelectedCardIds(prev => (prev.size === cards.length ? new Set() : new Set(cards.map(c => c.id))));
  };

  // A different deck's ids mean nothing here.
  useEffect(() => { setSelectedCardIds(new Set()); }, [selectedDeck]);

  // Study operations
  const startStudy = () => {
    const deckCards = getStudyPool();
    if (deckCards.length === 0) return;

    const shuffled = [...deckCards].sort(() => Math.random() - 0.5);
    setShuffledCards(shuffled);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudyStats({ known: 0, unknown: 0 });
    setActiveView('study');
  };

  // ---- Practice mode -------------------------------------------------------
  const practiceQuestion = (card) => (practiceDirection === 'front' ? card?.front : card?.back);
  const practiceAnswer = (card) => (practiceDirection === 'front' ? card?.back : card?.front);

  const normalizeAnswer = (v) => String(v || '')
    .toLowerCase()
    .replace(/[　\s]+/g, ' ')
    .replace(/[.,!?;:"'`’´]/g, '')
    .trim();

  // Cards are often written as "さん (san)" — one field holding both the script and
  // its reading. Typing either should count, so the stored answer is expanded
  // into every form it reasonably stands for: the whole string, the part
  // outside the brackets, what's inside them, and any slash/comma separated
  // alternatives. The card's own reading field counts too when the answer is
  // the front side.
  const answerVariants = (card) => {
    const raw = practiceAnswer(card);
    const out = new Set();
    const add = (v) => { const n = normalizeAnswer(v); if (n) out.add(n); };

    add(raw);
    const withoutBrackets = String(raw || '').replace(/[（(][^）)]*[）)]/g, ' ');
    add(withoutBrackets);
    (String(raw || '').match(/[（(]([^）)]*)[）)]/g) || [])
      .forEach(part => add(part.replace(/[（(）)]/g, '')));
    [raw, withoutBrackets].forEach(src => {
      String(src || '').split(/[\/,;、]/).forEach(add);
    });
    if (practiceDirection === 'back' && card?.reading) add(card.reading);

    return out;
  };

  const nextPracticeCard = useCallback(() => {
    practiceCountRef.current += 1;
    const count = practiceCountRef.current;

    // Missed cards come back after a short gap rather than immediately, so the
    // answer isn't still on screen when they reappear.
    const due = practiceWrongRef.current.filter(w => w.dueAfter <= count && w.card.id !== practiceLastRef.current);
    practiceWrongRef.current = practiceWrongRef.current.filter(w => !(w.dueAfter <= count && w.card.id !== practiceLastRef.current));

    let next = null;
    if (due.length > 0) {
      due.sort((a, b) => a.dueAfter - b.dueAfter);
      next = due[0].card;
    } else if (practiceUnseenRef.current.length > 0) {
      const candidates = practiceUnseenRef.current.filter(c => c.id !== practiceLastRef.current);
      const pool = candidates.length > 0 ? candidates : practiceUnseenRef.current;
      next = pool[Math.floor(Math.random() * pool.length)];
    } else if (practiceWrongRef.current.length > 0) {
      // Nothing new left, but cards are still owed a repeat.
      next = practiceWrongRef.current.shift().card;
    }

    if (!next) {
      // Round cleared — start another one over the same cards rather than
      // stopping, so practice runs until you leave it.
      practiceUnseenRef.current = [...practicePoolRef.current];
      practiceWrongRef.current = [];
      const pool = practiceUnseenRef.current.filter(c => c.id !== practiceLastRef.current);
      const from = pool.length > 0 ? pool : practiceUnseenRef.current;
      if (from.length === 0) { setActiveView('cards'); return; }
      next = from[Math.floor(Math.random() * from.length)];
    }

    practiceLastRef.current = next.id;
    setPracticeCard(next);
    setPracticeInput('');
    setPracticeFeedback(null);
    setTimeout(() => practiceInputRef.current?.focus(), 60);
  }, []);

  const startPractice = () => {
    const cards = getStudyPool();
    if (cards.length === 0) return;
    practicePoolRef.current = cards;
    practiceUnseenRef.current = [...cards];
    practiceWrongRef.current = [];
    practiceCountRef.current = 0;
    practiceLastRef.current = null;
    setPracticeStats({ correct: 0, wrong: 0, total: 0 });
    setPracticeStreak(0);
    setStudyStats({ known: 0, unknown: 0 });
    setActiveView('practice');
    nextPracticeCard();
  };

  const submitPractice = (raw) => {
    if (!practiceCard || practiceFeedback !== null) return;
    const value = normalizeAnswer(typeof raw === 'string' ? raw : practiceInput);
    if (!value) return;
    const isCorrect = answerVariants(practiceCard).has(value);

    setPracticeStats(st => ({
      correct: st.correct + (isCorrect ? 1 : 0),
      wrong: st.wrong + (isCorrect ? 0 : 1),
      total: st.total + 1,
    }));

    if (isCorrect) {
      practiceUnseenRef.current = practiceUnseenRef.current.filter(c => c.id !== practiceCard.id);
      playCompleteSound();
      setPracticeFeedback('correct');
      setPracticeStreak(v => v + 1);
      practiceTimerRef.current = setTimeout(() => nextPracticeCard(), 320);
    } else {
      practiceUnseenRef.current = practiceUnseenRef.current.filter(c => c.id !== practiceCard.id);
      const delay = 2 + Math.floor(Math.random() * 4); // 2-5 cards from now
      practiceWrongRef.current.push({ card: practiceCard, dueAfter: practiceCountRef.current + delay });
      playUncompleteSound();
      setPracticeFeedback('wrong');
      setPracticeStreak(0);
      setTimeout(() => practiceContinueRef.current?.focus(), 50);
    }
  };

  const practiceKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (practiceFeedback === 'wrong') { nextPracticeCard(); return; }
    if (practiceFeedback === null) submitPractice();
  };

  const endPractice = () => {
    clearTimeout(practiceTimerRef.current);
    setActiveView('cards');
  };

  useEffect(() => { localStorage.setItem('fc_practice_dir', practiceDirection); }, [practiceDirection]);

  const handleKnown = () => {
    if (currentCardIndex >= shuffledCards.length) return;

    const currentCard = shuffledCards[currentCardIndex];
    setCards(cards.map(c => c.id === currentCard.id ? { ...c, known: true } : c));
    setStudyStats(prev => ({ ...prev, known: prev.known + 1 }));
    nextCard();
  };

  const handleUnknown = () => {
    if (currentCardIndex >= shuffledCards.length) return;

    const currentCard = shuffledCards[currentCardIndex];
    setCards(cards.map(c => c.id === currentCard.id ? { ...c, known: false } : c));
    setStudyStats(prev => ({ ...prev, unknown: prev.unknown + 1 }));
    nextCard();
  };

  const nextCard = () => {
    if (currentCardIndex < shuffledCards.length - 1) {
      setCurrentCardIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      // No end screen: the deck reshuffles and keeps going until you exit.
      setShuffledCards(prev => [...prev].sort(() => Math.random() - 0.5));
      setCurrentCardIndex(0);
      setIsFlipped(false);
    }
  };

  const endStudy = () => {
    setActiveView('cards');
    setShuffledCards([]);
    setCurrentCardIndex(0);
  };

  const currentCard = shuffledCards[currentCardIndex];
  const deckCards = getDeckCards();
  const stats = selectedDeck ? getDeckStats(selectedDeck) : null;

  return (
    <div className={`fc-wrapper ${fullscreen ? 'fullscreen' : ''}`}>
      {/* Left Panel: deck list + AI side by side */}
      <div className="fc-sidebar" ref={sidebarRef}>

        {/* Deck column */}
        <div className="fc-deck-col">
        <div className="fc-menu">
          {/* New Deck Section */}
          <div className="fc-menu-section">
            {showNewDeckInput ? (
              <div className="fc-new-deck-form">
                <input
                  type="text"
                  placeholder="Deck name..."
                  value={newDeckName}
                  onChange={(e) => { playTypeSoundThrottled(); setNewDeckName(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createDeck();
                    if (e.key === 'Escape') {
                      setShowNewDeckInput(false);
                      setNewDeckName('');
                    }
                  }}
                  autoFocus
                />
                <button onClick={createDeck}>Add</button>
                <button onClick={() => {
                  setShowNewDeckInput(false);
                  setNewDeckName('');
                }}>Cancel</button>
              </div>
            ) : (
              <button
                className="fc-menu-btn fc-new-deck-btn"
                onClick={() => setShowNewDeckInput(true)}
              >
                + New Deck
              </button>
            )}
          </div>

          {/* Decks List */}
          <div className="fc-menu-section">
            <div className="fc-menu-label">Your Decks</div>
            {getAllDecks().length === 0 ? (
              <div className="fc-menu-empty">No decks yet</div>
            ) : (
              <div className="fc-decks-menu">
                {getAllDecks().map(deck => {
                  const deckStats = getDeckStats(deck.name);
                  return (
                    <div
                      key={deck.name}
                      className={`fc-deck-item ${selectedDeck === deck.name ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedDeck(deck.name);
                        setActiveView('cards');
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setSelectedDeck(deck.name);
                        setActiveView('cards');
                        setEditingDeckName(deck.name);
                        setEditingDeckTitle(deck.name);
                      }}
                    >
                      <div className="fc-deck-item-color" style={{ backgroundColor: deck.color }} />
                      {editingDeckName === deck.name ? (
                        <input
                          className="fc-deck-item-rename-input"
                          value={editingDeckTitle}
                          onChange={(e) => setEditingDeckTitle(e.target.value)}
                          onBlur={() => {
                            if (editingDeckTitle.trim()) renameDeck(deck.name, editingDeckTitle);
                            else { setEditingDeckName(null); setEditingDeckTitle(''); }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editingDeckTitle.trim()) renameDeck(deck.name, editingDeckTitle);
                            if (e.key === 'Escape') { setEditingDeckName(null); setEditingDeckTitle(''); }
                            e.stopPropagation();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <div className="fc-deck-item-name">{deck.name}</div>
                      )}
                      <div className="fc-deck-item-count">{deckStats.total}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>{/* end fc-deck-col */}

        {/* Vertical divider */}
        <div className="fc-col-divider" />

        {/* AI column */}
        <div className="fc-ai-col">
          <div className="fc-ai-panel">
            <div className="fc-ai-panel-header">
              <span className="fc-ai-panel-title">AI Assistant</span>
              <button
                className="fc-ai-key-btn"
                onClick={() => { setApiKeyDraft(localStorage.getItem('anthropic_api_key') || ''); setShowApiKeyInput(true); }}
                title="Set API key"
              >🔑</button>
            </div>

            <div className="fc-ai-mode-toggle">
              <button
                className={`fc-ai-mode-btn ${aiMode === 'single' ? 'active' : ''}`}
                onClick={() => { setAiMode('single'); setAiError(null); setBulkResults(null); }}
              >Single</button>
              <button
                className={`fc-ai-mode-btn ${aiMode === 'bulk' ? 'active' : ''}`}
                onClick={() => { setAiMode('bulk'); setAiError(null); setAiResult(null); }}
              >Bulk</button>
              <button
                className={`fc-ai-mode-btn ${aiMode === 'image' ? 'active' : ''}`}
                onClick={() => { setAiMode('image'); setAiError(null); setAiResult(null); setBulkResults(null); }}
              >Image</button>
            </div>

            {showApiKeyInput ? (
              <div className="fc-ai-apikey-row">
                <input
                  type="password"
                  className="fc-ai-key-input"
                  placeholder="Anthropic API key..."
                  value={apiKeyDraft}
                  onChange={e => setApiKeyDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveApiKey(); if (e.key === 'Escape') setShowApiKeyInput(false); }}
                  autoFocus
                />
                <div className="fc-ai-apikey-btns">
                  <button className="fc-ai-save-btn" onClick={saveApiKey}>Save</button>
                  <button className="fc-ai-cancel-btn" onClick={() => setShowApiKeyInput(false)}>Cancel</button>
                </div>
              </div>
            ) : aiMode === 'single' ? (
              <div className="fc-ai-input-row">
                <input
                  type="text"
                  className="fc-ai-input"
                  placeholder="Enter a word or concept..."
                  value={aiWord}
                  onChange={e => setAiWord(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') askAI(); }}
                  disabled={aiLoading}
                />
                <button className="fc-ai-ask-btn" onClick={askAI} disabled={aiLoading || !aiWord.trim()} title="Ask AI">
                  {aiLoading ? <span className="fc-ai-spinner" /> : 'Ask'}
                </button>
              </div>
            ) : aiMode === 'image' ? (
              <div className="fc-ai-image-input-area">
                {aiImages.length > 0 && (
                  <div className="fc-ai-image-preview">
                    {aiImages.map((img, i) => (
                      <div key={i} className="fc-ai-image-thumb">
                        <img src={img.dataUrl} alt="" />
                        <button className="fc-ai-image-remove" onClick={() => setAiImages(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file" accept="image/*" multiple ref={imageFileRef} style={{ display: 'none' }}
                  onChange={e => { handleImageFiles([...e.target.files]); e.target.value = ''; }}
                />
                <div className="fc-ai-image-btn-row">
                  <button className="fc-ai-attach-btn" onClick={() => imageFileRef.current?.click()} disabled={aiLoading} title="Select image">
                    📎 Select Image
                  </button>
                  <button className="fc-ai-ask-btn" onClick={extractFromImages} disabled={aiLoading || aiImages.length === 0}>
                    {aiLoading ? <span className="fc-ai-spinner" /> : 'Extract Words'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="fc-ai-bulk-input-area">
                <textarea
                  className="fc-ai-bulk-textarea"
                  placeholder="Describe what cards to generate, e.g. '12 months of the year in English and Turkish'"
                  value={bulkPrompt}
                  onChange={e => setBulkPrompt(e.target.value)}
                  disabled={aiLoading}
                  rows={3}
                />
                <button className="fc-ai-ask-btn" onClick={generateBulk} disabled={aiLoading || !bulkPrompt.trim()}>
                  {aiLoading ? <span className="fc-ai-spinner" /> : 'Generate'}
                </button>
              </div>
            )}

            {aiError && <div className="fc-ai-error">{aiError}</div>}

            {aiLoading && (
              <div className="fc-ai-loading-state">
                <span className="fc-ai-spinner-lg" />
                <span>Waiting for response...</span>
              </div>
            )}

            {aiMode === 'single' && aiResult && !aiLoading && (
              <div className="fc-ai-result-panel">
                <div className="fc-ai-result-word">{aiResult.word}</div>
                <div className="fc-ai-result-translation">{aiResult.translation}</div>
                <div className="fc-ai-result-divider" />
                <div className="fc-ai-result-explanation">{aiResult.explanation}</div>
                <div className="fc-ai-card-preview">
                  <div className="fc-ai-card-preview-label">Flash Card preview</div>
                  <div className="fc-ai-card-preview-front">
                    <span className="fc-ai-card-side-label">Front</span>
                    <span>{aiResult.word}</span>
                  </div>
                  <div className="fc-ai-card-preview-back">
                    <span className="fc-ai-card-side-label">Back</span>
                    {aiResult.translation && <span className="fc-ai-preview-translation">{aiResult.translation}</span>}
                    <span>{aiResult.explanation}</span>
                  </div>
                </div>
                <button className="fc-ai-add-btn" onClick={addAiCardToFlashCards}>
                  + Add to Flash Cards
                </button>
                {!selectedDeck && decks.length === 0 && (
                  <div className="fc-ai-no-deck-hint">Create a deck first</div>
                )}
              </div>
            )}

            {aiMode === 'bulk' && bulkResults && !aiLoading && (
              <div className="fc-ai-bulk-results">
                <div className="fc-ai-bulk-results-header">
                  <span>{bulkResults.length} cards generated</span>
                  <button className="fc-ai-add-btn" onClick={addAllBulkCards}>+ Add All</button>
                </div>
                <div className="fc-ai-bulk-list">
                  {bulkResults.map((item, i) => (
                    <div key={i} className="fc-ai-bulk-item">
                      <span className="fc-ai-bulk-front">{item.front}</span>
                      <span className="fc-ai-bulk-arrow">→</span>
                      <span className="fc-ai-bulk-back">{item.back}</span>
                    </div>
                  ))}
                </div>
                {!selectedDeck && decks.length === 0 && (
                  <div className="fc-ai-no-deck-hint">Create a deck first</div>
                )}
              </div>
            )}

            {aiMode === 'image' && imageResults && !aiLoading && (
              <div className="fc-ai-bulk-results">
                <div className="fc-ai-bulk-results-header">
                  <span>{imageResults.length} words found</span>
                </div>

                <div className="fc-ai-deck-target-row">
                  <select
                    className="fc-ai-deck-select"
                    value={imageTargetDeck}
                    onChange={e => setImageTargetDeck(e.target.value)}
                  >
                    <option value="" disabled>Select deck...</option>
                    {decks.map(d => (
                      <option key={d.name} value={d.name}>{d.name}</option>
                    ))}
                    <option value="__new__">+ Create new deck...</option>
                  </select>
                  {imageTargetDeck === '__new__' && (
                    <input
                      type="text"
                      className="fc-ai-deck-new-input"
                      placeholder="New deck name..."
                      value={imageNewDeckName}
                      onChange={e => setImageNewDeckName(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>

                <div className="fc-ai-bulk-list">
                  {imageResults.map((item, i) => (
                    <div key={i} className={`fc-ai-bulk-item fc-ai-bulk-item--jp ${item.corrected ? 'fc-ai-bulk-item--corrected' : ''}`}>
                      <span className="fc-ai-bulk-front">{item.writing}</span>
                      <span className="fc-ai-bulk-reading">{item.reading}</span>
                      <span className="fc-ai-bulk-arrow">→</span>
                      <span className="fc-ai-bulk-back">{item.turkish}</span>
                      {item.corrected && <span className="fc-ai-corrected-badge" title="AI corrected the information from the image">✓ corrected</span>}
                    </div>
                  ))}
                </div>

                <button className="fc-ai-add-btn" onClick={addAllImageCards}>+ Add All</button>
              </div>
            )}

            {!aiResult && !bulkResults && !imageResults && !aiLoading && !aiError && (
              <div className="fc-ai-empty-state">
                <div className="fc-ai-empty-icon">✦</div>
                <div className="fc-ai-empty-text">
                  {aiMode === 'single'
                    ? "Type a word or concept you're curious about, let AI explain it and add it as a flash card."
                    : aiMode === 'image'
                    ? "Upload an image with Japanese vocabulary notes — I'll automatically extract the writing, reading, and Turkish meaning, and add them."
                    : 'Describe a topic and AI will generate multiple flash cards at once.'}
                </div>
              </div>
            )}
          </div>
        </div>{/* end fc-ai-col */}

      </div>

      {/* Main Content Area */}
      <div className="fc-content">
        {/* Decks Overview */}
        {activeView === 'decks' && (
          <div className="fc-main-view">
            <div className="fc-decks-overview">
              {getAllDecks().length === 0 ? (
                <div className="fc-empty-state">
                  <p>Create a deck to get started</p>
                </div>
              ) : (
                getAllDecks().map(deck => {
                  const deckStats = getDeckStats(deck.name);
                  const progress = deckStats.total > 0
                    ? Math.round((deckStats.known / deckStats.total) * 100)
                    : 0;

                  return (
                    <div
                      key={deck.name}
                      className="fc-deck-overview-card"
                      onClick={() => {
                        setSelectedDeck(deck.name);
                        setActiveView('cards');
                      }}
                      style={{ borderColor: deck.color }}
                    >
                      <h3 style={{ color: deck.color }}>{deck.name}</h3>
                      <div className="fc-overview-stats">
                        <span>{deckStats.total} cards</span>
                        <span>{progress}% mastered</span>
                      </div>
                      <div className="fc-progress-bar">
                        <div
                          className="fc-progress-fill"
                          style={{ width: `${progress}%`, background: deck.color }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Cards Management */}
        {activeView === 'cards' && selectedDeck && (
          <div className="fc-main-view">
            <div className="fc-main-header">
              <div className="fc-deck-title-section">
                {editingDeckName === selectedDeck ? (
                  <input
                    type="text"
                    className="fc-deck-title-input"
                    value={editingDeckTitle}
                    onChange={(e) => { playTypeSoundThrottled(); setEditingDeckTitle(e.target.value); }}
                    onBlur={() => {
                      if (editingDeckTitle.trim()) {
                        renameDeck(selectedDeck, editingDeckTitle);
                      } else {
                        setEditingDeckName(null);
                        setEditingDeckTitle('');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editingDeckTitle.trim()) {
                        renameDeck(selectedDeck, editingDeckTitle);
                      }
                      if (e.key === 'Escape') {
                        setEditingDeckName(null);
                        setEditingDeckTitle('');
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <h1
                    onDoubleClick={() => {
                      setEditingDeckName(selectedDeck);
                      setEditingDeckTitle(selectedDeck);
                    }}
                    style={{ color: getDeckByName(selectedDeck)?.color }}
                  >
                    {selectedDeck}
                  </h1>
                )}
                <div className="fc-color-picker-wrapper">
                  <button
                    className="fc-color-btn"
                    onClick={() => setShowColorPicker(showColorPicker === selectedDeck ? null : selectedDeck)}
                    style={{ backgroundColor: getDeckByName(selectedDeck)?.color }}
                    title="Change color"
                  />
                  {showColorPicker === selectedDeck && (
                    <div className="fc-color-picker">
                      {DECK_COLORS.map(color => (
                        <button
                          key={color}
                          className="fc-color-option"
                          style={{ backgroundColor: color }}
                          onClick={() => updateDeckColor(selectedDeck, color)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="fc-main-actions">
                <button onClick={resetDeckProgress}>Reset Progress</button>
                <button onClick={() => deleteDeck(selectedDeck)}>Delete Deck</button>
                {deckCards.length > 0 && (
                  <>
                    <div className="fc-mark-filter">
                      {CARD_MARKS.map(m => (
                        <button
                          key={m.id}
                          className={`fc-mark-chip${markFilter.has(m.id) ? ' active' : ''}`}
                          style={{ '--mark': m.hex }}
                          title={`Only ${m.label.toLowerCase()} cards`}
                          onClick={() => toggleMarkFilter(m.id)}
                        >
                          <span className="fc-mark-dot" style={{ background: m.hex }} />
                          {deckCards.filter(c => c.mark === m.id).length}
                        </button>
                      ))}
                      <button
                        className={`fc-mark-chip${markFilter.has('none') ? ' active' : ''}`}
                        title="Only unmarked cards"
                        onClick={() => toggleMarkFilter('none')}
                      >
                        <span className="fc-mark-dot fc-mark-dot--none" />
                        {deckCards.filter(c => !c.mark).length}
                      </button>
                    </div>
                    {selectedCardIds.size > 0 && (
                      <span className="fc-selection-note">
                        {selectedCardIds.size} selected
                        <button className="fc-selection-clear" onClick={() => setSelectedCardIds(new Set())}>clear</button>
                      </span>
                    )}
                    <button className="fc-practice-btn" onClick={startPractice}>
                      {selectedCardIds.size > 0 ? `Practice ${selectedCardIds.size}` : 'Practice'}
                    </button>
                    <button className="fc-study-btn" onClick={startStudy}>
                      {selectedCardIds.size > 0 ? `Study ${selectedCardIds.size}` : 'Study'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stats */}
            {stats && (
              <div className="fc-stats-bar">
                <div className="fc-stat">
                  <span className="fc-stat-value">{stats.total}</span>
                  <span className="fc-stat-label">Total</span>
                </div>
                <div className="fc-stat known">
                  <span className="fc-stat-value">{stats.known}</span>
                  <span className="fc-stat-label">Mastered</span>
                </div>
                <div className="fc-stat unknown">
                  <span className="fc-stat-value">{stats.unknown}</span>
                  <span className="fc-stat-label">Learning</span>
                </div>
                <div className="fc-stat fresh">
                  <span className="fc-stat-value">{stats.fresh}</span>
                  <span className="fc-stat-label">New</span>
                </div>
              </div>
            )}

            {/* Add New Card Form */}
            <div className="fc-add-card-section">
              <h3>Add New Card</h3>
              <CardForm
                onSave={(front, reading, back) => addCard(front, reading, back)}
                onCancel={() => {}}
              />
            </div>

            {/* Cards List */}
            <div className="fc-cards-section">
              <h3>Cards ({deckCards.length})</h3>
              {deckCards.length === 0 ? (
                <div className="fc-empty-state">
                  <p>No cards yet. Add your first card above.</p>
                </div>
              ) : (
                <div className="fc-cards-table-wrapper">
                  <table className="fc-cards-table">
                    <thead>
                      <tr>
                        <th className="fc-check-col">
                          <input
                            type="checkbox"
                            checked={deckCards.length > 0 && selectedCardIds.size === deckCards.length}
                            ref={el => { if (el) el.indeterminate = selectedCardIds.size > 0 && selectedCardIds.size < deckCards.length; }}
                            onChange={() => toggleSelectAll(deckCards)}
                            title="Select all"
                          />
                        </th>
                        <th>#</th>
                        <th>Front</th>
                        <th>Reading</th>
                        <th>Back</th>
                        <th>Mark</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deckCards.map((card, index) => (
                        <tr key={card.id} className={selectedCardIds.has(card.id) ? 'fc-row-selected' : ''}>
                          {editingCard === card.id ? (
                            <td colSpan="7">
                              <CardForm
                                initialFront={card.front}
                                initialReading={card.reading || ''}
                                initialBack={card.back}
                                onSave={(front, reading, back) => updateCard(card.id, front, reading, back)}
                                onCancel={() => setEditingCard(null)}
                              />
                            </td>
                          ) : (
                            <>
                              <td className="fc-check-col">
                                <input
                                  type="checkbox"
                                  checked={selectedCardIds.has(card.id)}
                                  onChange={() => toggleCardSelected(card.id)}
                                />
                              </td>
                              <td>{index + 1}</td>
                              <td>{card.front}</td>
                              <td className="fc-reading-cell">{card.reading || '—'}</td>
                              <td>{card.back}</td>
                              <td>
                                <div className="fc-mark-cell">
                                  {CARD_MARKS.map(m => (
                                    <button
                                      key={m.id}
                                      className={`fc-mark-btn${card.mark === m.id ? ' active' : ''}`}
                                      style={{ background: m.hex }}
                                      title={m.label}
                                      onClick={() => setCardMark(card.id, m.id)}
                                    />
                                  ))}
                                </div>
                              </td>
                              <td>
                                <button onClick={() => setEditingCard(card.id)}>Edit</button>
                                <button onClick={() => deleteCard(card.id)}>Delete</button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Study Mode */}
        {activeView === 'study' && currentCard && (
          <div className="fc-study-view">
            <div className="fc-study-header">
              <button onClick={endStudy}>✕ Exit Study</button>
              <div className="fc-study-progress">
                <span>{currentCardIndex + 1} / {shuffledCards.length}</span>
                <div className="fc-study-progress-bar">
                  <div
                    className="fc-study-progress-fill"
                    style={{ width: `${((currentCardIndex) / shuffledCards.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className="fc-study-zoom">
                <button
                  onClick={() => setStudyScale(s => Math.max(0.6, Math.round((s - 0.1) * 10) / 10))}
                  title="Zoom out"
                >−</button>
                <span className="fc-study-zoom-value">{Math.round(studyScale * 100)}%</span>
                <button
                  onClick={() => setStudyScale(s => Math.min(2.5, Math.round((s + 0.1) * 10) / 10))}
                  title="Zoom in"
                >+</button>
              </div>
            </div>

            <div className="fc-study-body">
            <div
              className={`fc-study-card ${isFlipped ? 'flipped' : ''}`}
              style={{ '--fc-scale': studyScale }}
              onClick={() => { playClickSound(); setIsFlipped(!isFlipped); }}
            >
              <div className="fc-study-card-inner">
                <div className="fc-study-card-front">
                  <span className="fc-card-label">Question</span>
                  {currentCard.reading && <p className="fc-study-card-reading">{currentCard.reading}</p>}
                  <p>{currentCard.front}</p>
                </div>
                <div className="fc-study-card-back">
                  <span className="fc-card-label">Answer</span>
                  <p>{currentCard.back}</p>
                </div>
              </div>
            </div>

            <div className="fc-study-hint">
              {!isFlipped ? 'Click card or press Space to reveal answer' : 'Rate your knowledge'}
            </div>

            {isFlipped && (
              <div className="fc-study-actions">
                <button className="fc-action-unknown" onClick={handleUnknown}>
                  <span>✗ Still Learning</span>
                  <span className="fc-action-key">← or A</span>
                </button>
                <button className="fc-action-known" onClick={handleKnown}>
                  <span>✓ Got It!</span>
                  <span className="fc-action-key">→ or D</span>
                </button>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Practice Mode */}
        {activeView === 'practice' && practiceCard && (
          <div className="fc-study-view">
            <div className="fc-study-header">
              <button onClick={endPractice}>✕ Exit Practice</button>
              <div className="fc-study-progress">
                <span>{practiceUnseenRef.current.length + practiceWrongRef.current.length} left</span>
                <div className="fc-study-progress-bar">
                  <div
                    className="fc-study-progress-fill"
                    style={{ width: `${deckCards.length ? ((deckCards.length - practiceUnseenRef.current.length) / deckCards.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="fc-practice-meta">
                <span className="fc-practice-streak">🔥 {practiceStreak}</span>
                <button
                  className="fc-practice-dir"
                  title="Swap which side is asked"
                  onClick={() => setPracticeDirection(d => (d === 'front' ? 'back' : 'front'))}
                >
                  {practiceDirection === 'front' ? 'Front → Back' : 'Back → Front'}
                </button>
              </div>
            </div>

            <div className="fc-study-body">
              <div className={`fc-practice-card ${practiceFeedback || ''}`}>
                <span className="fc-card-label">Question</span>
                {practiceDirection === 'front' && practiceCard.reading && (
                  <p className="fc-practice-reading">{practiceCard.reading}</p>
                )}
                <p className="fc-practice-question">{practiceQuestion(practiceCard)}</p>
              </div>

              <input
                ref={practiceInputRef}
                className={`fc-practice-input ${practiceFeedback || ''}`}
                placeholder="Type the answer…"
                value={practiceInput}
                disabled={practiceFeedback !== null}
                onChange={e => setPracticeInput(e.target.value)}
                onKeyDown={practiceKeyDown}
                autoFocus
              />

              {practiceFeedback === 'wrong' ? (
                <div className="fc-practice-feedback wrong">
                  <span>Answer: <b>{practiceAnswer(practiceCard)}</b></span>
                  <button ref={practiceContinueRef} onClick={() => nextPracticeCard()} onKeyDown={practiceKeyDown}>
                    Continue (Enter)
                  </button>
                </div>
              ) : practiceFeedback === 'correct' ? (
                <div className="fc-practice-feedback correct">Correct</div>
              ) : (
                <div className="fc-study-hint">Press Enter to check</div>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {activeView === 'results' && (
          <div className="fc-results-view">
            <h1>Study Complete!</h1>
            <div className="fc-results-stats">
              <div className="fc-result-stat known">
                <span className="fc-result-num">{studyStats.known}</span>
                <span className="fc-result-label">Mastered</span>
              </div>
              <div className="fc-result-stat unknown">
                <span className="fc-result-num">{studyStats.unknown}</span>
                <span className="fc-result-label">Need Review</span>
              </div>
            </div>
            <div className="fc-results-message">
              {studyStats.unknown === 0
                ? "Perfect! You've mastered all cards!"
                : `Keep practicing! ${studyStats.unknown} cards need more review.`}
            </div>
            <div className="fc-results-actions">
              <button onClick={startStudy}>Study Again</button>
              <button onClick={endStudy}>Back to Cards</button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// Card Form Component
function CardForm({ initialFront = '', initialReading = '', initialBack = '', onSave, onCancel }) {
  const [front, setFront] = useState(initialFront);
  const [reading, setReading] = useState(initialReading);
  const [back, setBack] = useState(initialBack);

  const handleSave = () => {
    if (front.trim() && back.trim()) {
      onSave(front, reading, back);
      setFront('');
      setReading('');
      setBack('');
    }
  };

  return (
    <div className="fc-card-form">
      <input
        type="text"
        placeholder="Front / Writing"
        value={front}
        onChange={(e) => { playTypeSoundThrottled(); setFront(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <input
        type="text"
        placeholder="Reading (optional)"
        value={reading}
        onChange={(e) => { playTypeSoundThrottled(); setReading(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <input
        type="text"
        placeholder="Back / Turkish"
        value={back}
        onChange={(e) => { playTypeSoundThrottled(); setBack(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="fc-card-form-actions">
        <button onClick={handleSave} disabled={!front.trim() || !back.trim()}>
          Save
        </button>
        {initialFront && (
          <button onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  );
}

export default FlashCards;
