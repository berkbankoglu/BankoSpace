import { useState, useEffect, useRef } from 'react';
import './QuickNote.css';
import { playTypeSoundThrottled, playAddSound, playDeleteSound } from '../utils/sounds';

function QuickNote({ onClose, isPopup = false }) {
  const [englishText, setEnglishText] = useState('');
  const [turkishText, setTurkishText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [savedNotes, setSavedNotes] = useState(() => {
    const saved = localStorage.getItem('quickNotes');
    return saved ? JSON.parse(saved) : [];
  });
  const [addedToFC, setAddedToFC] = useState(null);
  const debounceRef = useRef(null);
  const englishInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('quickNotes', JSON.stringify(savedNotes));
  }, [savedNotes]);

  useEffect(() => {
    englishInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isPopup) {
      const handleKey = (e) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [onClose, isPopup]);

  useEffect(() => {
    if (!englishText.trim()) {
      setTurkishText('');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsTranslating(true);
      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishText.trim())}&langpair=en|tr`
        );
        const data = await res.json();
        if (data.responseData?.translatedText) {
          setTurkishText(data.responseData.translatedText);
        }
      } catch {
        setTurkishText('...');
      }
      setIsTranslating(false);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [englishText]);

  const handleSave = () => {
    if (!englishText.trim()) return;
    playAddSound();
    setSavedNotes(prev => [{ id: Date.now(), en: englishText.trim(), tr: turkishText.trim() }, ...prev]);
    setEnglishText('');
    setTurkishText('');
    englishInputRef.current?.focus();
  };

  const addToFlashCards = (note) => {
    const deckName = 'Quick Note';

    // Ensure deck exists
    const savedDecks = JSON.parse(localStorage.getItem('flashCardGroups') || '[]');
    if (!savedDecks.some(d => (typeof d === 'string' ? d : d.name) === deckName)) {
      savedDecks.push({ name: deckName, color: '#58a6ff' });
      localStorage.setItem('flashCardGroups', JSON.stringify(savedDecks));
    }

    // Add card
    const savedCards = JSON.parse(localStorage.getItem('flashCards') || '[]');
    savedCards.push({
      id: Date.now(),
      front: note.en,
      back: note.tr,
      group: deckName,
      known: null,
      createdAt: Date.now()
    });
    localStorage.setItem('flashCards', JSON.stringify(savedCards));
    window.dispatchEvent(new Event('flashcards-updated'));
    playAddSound();
    setAddedToFC(note.id);
    setTimeout(() => setAddedToFC(null), 1500);
  };

  const content = (
    <div className={`qn-content ${isPopup ? 'popup-mode' : ''}`}>
      <div className="qn-inputs">
        <input
          ref={englishInputRef}
          className="qn-input"
          placeholder="English"
          value={englishText}
          onChange={(e) => { playTypeSoundThrottled(); setEnglishText(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && englishText.trim()) handleSave(); }}
        />
        <span className="qn-arrow">{isTranslating ? '...' : '→'}</span>
        <input
          className="qn-input readonly"
          placeholder="Turkce"
          value={turkishText}
          readOnly
        />
        <button className="qn-save" onClick={handleSave} disabled={!englishText.trim()}>+</button>
      </div>

      {savedNotes.length > 0 && (
        <div className="qn-list">
          {savedNotes.map(note => (
            <div key={note.id} className="qn-item">
              <span className="qn-en">{note.en}</span>
              <span className="qn-tr">{note.tr}</span>
              <button className={`qn-fc ${addedToFC === note.id ? 'added' : ''}`} onClick={() => addToFlashCards(note)} title="Add to Flash Cards">{addedToFC === note.id ? '✓' : '⬦'}</button>
              <button className="qn-del" onClick={() => { playDeleteSound(); setSavedNotes(prev => prev.filter(n => n.id !== note.id)); }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isPopup) return content;

  return (
    <div className="qn-overlay" onClick={onClose}>
      <div className="qn-popup" onClick={(e) => e.stopPropagation()}>
        <button className="qn-close" onClick={onClose}>×</button>
        {content}
      </div>
    </div>
  );
}

export default QuickNote;
