import { useState, useEffect, useRef } from 'react';
import './FlashCards.css';

function FlashCards({ fullscreen = false }) {
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [mode, setMode] = useState('decks'); // 'decks', 'cards', 'study', 'add'
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [editingDeckId, setEditingDeckId] = useState(null);
  const [editingDeckName, setEditingDeckName] = useState('');
  const [studyStats, setStudyStats] = useState({ known: 0, unknown: 0 });
  const [shuffledCards, setShuffledCards] = useState([]);
  const frontInputRef = useRef(null);

  // Load data
  useEffect(() => {
    const savedCards = localStorage.getItem('flashCards');
    const savedDecks = localStorage.getItem('flashCardGroups');

    if (savedCards) {
      const loadedCards = JSON.parse(savedCards);
      setCards(loadedCards.map(card => ({
        ...card,
        group: card.group || 'General',
        known: card.known !== undefined ? card.known : null,
      })));
    }

    if (savedDecks) {
      setDecks(JSON.parse(savedDecks));
    }
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem('flashCards', JSON.stringify(cards));
  }, [cards]);

  useEffect(() => {
    localStorage.setItem('flashCardGroups', JSON.stringify(decks));
  }, [decks]);

  // Keyboard shortcuts
  useEffect(() => {
    if (mode !== 'study') return;

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
  }, [mode, currentCardIndex, shuffledCards]);

  // Get all unique decks
  const getAllDecks = () => {
    const deckNames = [...new Set([...decks, ...cards.map(c => c.group)])];
    return deckNames.filter(Boolean).sort();
  };

  // Get cards for selected deck
  const getDeckCards = () => cards.filter(c => c.group === selectedDeck);

  // Create new deck
  const createDeck = () => {
    let num = 1;
    let name = `Deck ${num}`;
    const existing = getAllDecks();
    while (existing.includes(name)) {
      num++;
      name = `Deck ${num}`;
    }
    setDecks([...decks, name]);
    setSelectedDeck(name);
    setMode('cards');
  };

  // Delete deck
  const deleteDeck = (deckName, e) => {
    e.stopPropagation();
    const cardCount = cards.filter(c => c.group === deckName).length;
    if (window.confirm(`Delete "${deckName}" and its ${cardCount} cards?`)) {
      setCards(cards.filter(c => c.group !== deckName));
      setDecks(decks.filter(d => d !== deckName));
      if (selectedDeck === deckName) {
        setSelectedDeck(null);
        setMode('decks');
      }
    }
  };

  // Rename deck
  const renameDeck = (oldName, newName) => {
    if (newName && newName.trim() && newName !== oldName && !getAllDecks().includes(newName.trim())) {
      setCards(cards.map(c => c.group === oldName ? { ...c, group: newName.trim() } : c));
      setDecks(decks.map(d => d === oldName ? newName.trim() : d));
      if (selectedDeck === oldName) setSelectedDeck(newName.trim());
    }
    setEditingDeckId(null);
    setEditingDeckName('');
  };

  // Add card
  const addCard = () => {
    if (newFront.trim() && newBack.trim()) {
      const card = {
        id: Date.now(),
        front: newFront.trim(),
        back: newBack.trim(),
        group: selectedDeck,
        known: null,
        createdAt: Date.now()
      };
      setCards([...cards, card]);
      setNewFront('');
      setNewBack('');
      frontInputRef.current?.focus();
    }
  };

  // Delete card
  const deleteCard = (id) => {
    setCards(cards.filter(c => c.id !== id));
  };

  // Start study
  const startStudy = () => {
    const deckCards = getDeckCards();
    if (deckCards.length === 0) return;

    // Shuffle cards
    const shuffled = [...deckCards].sort(() => Math.random() - 0.5);
    setShuffledCards(shuffled);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudyStats({ known: 0, unknown: 0 });
    setMode('study');
  };

  // Handle known/unknown
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
      setMode('results');
    }
  };

  const endStudy = () => {
    setMode('cards');
    setShuffledCards([]);
    setCurrentCardIndex(0);
  };

  // Reset deck progress
  const resetDeckProgress = () => {
    setCards(cards.map(c => c.group === selectedDeck ? { ...c, known: null } : c));
  };

  const currentCard = shuffledCards[currentCardIndex];
  const deckCards = getDeckCards();
  const knownCount = deckCards.filter(c => c.known === true).length;
  const unknownCount = deckCards.filter(c => c.known === false).length;

  return (
    <div className={`fc-wrapper ${fullscreen ? 'fullscreen' : ''}`}>
      {/* Decks View */}
      {mode === 'decks' && (
        <div className="fc-decks-view">
          <div className="fc-decks-header">
            <h2>Flash Card Decks</h2>
            <button className="fc-create-deck-btn" onClick={createDeck}>
              + New Deck
            </button>
          </div>

          <div className="fc-decks-grid">
            {getAllDecks().map(deckName => {
              const deckCardCount = cards.filter(c => c.group === deckName).length;
              const deckKnown = cards.filter(c => c.group === deckName && c.known === true).length;
              const progress = deckCardCount > 0 ? Math.round((deckKnown / deckCardCount) * 100) : 0;

              return (
                <div
                  key={deckName}
                  className="fc-deck-card"
                  onClick={() => {
                    setSelectedDeck(deckName);
                    setMode('cards');
                  }}
                >
                  {editingDeckId === deckName ? (
                    <input
                      type="text"
                      value={editingDeckName}
                      onChange={(e) => setEditingDeckName(e.target.value)}
                      onBlur={() => renameDeck(deckName, editingDeckName)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameDeck(deckName, editingDeckName);
                        if (e.key === 'Escape') { setEditingDeckId(null); setEditingDeckName(''); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="fc-deck-name-input"
                    />
                  ) : (
                    <h3
                      className="fc-deck-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingDeckId(deckName);
                        setEditingDeckName(deckName);
                      }}
                    >
                      {deckName}
                    </h3>
                  )}

                  <div className="fc-deck-stats">
                    <span className="fc-deck-count">{deckCardCount} cards</span>
                    {deckCardCount > 0 && (
                      <div className="fc-deck-progress">
                        <div className="fc-progress-bar">
                          <div className="fc-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="fc-progress-text">{progress}% mastered</span>
                      </div>
                    )}
                  </div>

                  <button
                    className="fc-deck-delete"
                    onClick={(e) => deleteDeck(deckName, e)}
                    title="Delete deck"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            {getAllDecks().length === 0 && (
              <div className="fc-empty-state">
                <span className="fc-empty-icon">📚</span>
                <p>No decks yet</p>
                <p className="fc-empty-hint">Create your first deck to start learning!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cards View */}
      {mode === 'cards' && selectedDeck && (
        <div className="fc-cards-view">
          <div className="fc-cards-header">
            <button className="fc-back-btn" onClick={() => setMode('decks')}>
              ← Back
            </button>
            <h2>{selectedDeck}</h2>
            <div className="fc-cards-actions">
              {deckCards.length > 0 && (
                <>
                  <button className="fc-reset-btn" onClick={resetDeckProgress} title="Reset progress">
                    ↺
                  </button>
                  <button className="fc-study-btn" onClick={startStudy}>
                    Study ({deckCards.length})
                  </button>
                </>
              )}
              <button className="fc-add-card-btn" onClick={() => setMode('add')}>
                + Add Card
              </button>
            </div>
          </div>

          <div className="fc-deck-overview">
            <div className="fc-stat-box known">
              <span className="fc-stat-num">{knownCount}</span>
              <span className="fc-stat-label">Mastered</span>
            </div>
            <div className="fc-stat-box unknown">
              <span className="fc-stat-num">{unknownCount}</span>
              <span className="fc-stat-label">Learning</span>
            </div>
            <div className="fc-stat-box total">
              <span className="fc-stat-num">{deckCards.length - knownCount - unknownCount}</span>
              <span className="fc-stat-label">New</span>
            </div>
          </div>

          <div className="fc-cards-list">
            {deckCards.length === 0 ? (
              <div className="fc-empty-state">
                <span className="fc-empty-icon">🎴</span>
                <p>No cards in this deck</p>
                <button className="fc-add-first-btn" onClick={() => setMode('add')}>
                  Add your first card
                </button>
              </div>
            ) : (
              deckCards.map((card, index) => (
                <div key={card.id} className={`fc-card-item ${card.known === true ? 'known' : card.known === false ? 'unknown' : ''}`}>
                  <div className="fc-card-number">{index + 1}</div>
                  <div className="fc-card-content">
                    <div className="fc-card-front-text">{card.front}</div>
                    <div className="fc-card-back-text">{card.back}</div>
                  </div>
                  <div className="fc-card-status">
                    {card.known === true && <span className="status-known">✓</span>}
                    {card.known === false && <span className="status-unknown">✗</span>}
                  </div>
                  <button className="fc-card-delete" onClick={() => deleteCard(card.id)}>×</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Add Card View */}
      {mode === 'add' && (
        <div className="fc-add-view">
          <div className="fc-add-header">
            <button className="fc-back-btn" onClick={() => setMode('cards')}>
              ← Back to {selectedDeck}
            </button>
            <h2>Add New Card</h2>
          </div>

          <div className="fc-add-form">
            <div className="fc-form-group">
              <label>Front (Question)</label>
              <textarea
                ref={frontInputRef}
                value={newFront}
                onChange={(e) => setNewFront(e.target.value)}
                placeholder="Enter the question or term..."
                rows={3}
                autoFocus
              />
            </div>

            <div className="fc-form-group">
              <label>Back (Answer)</label>
              <textarea
                value={newBack}
                onChange={(e) => setNewBack(e.target.value)}
                placeholder="Enter the answer or definition..."
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    addCard();
                  }
                }}
              />
            </div>

            <div className="fc-form-actions">
              <button
                className="fc-save-card-btn"
                onClick={addCard}
                disabled={!newFront.trim() || !newBack.trim()}
              >
                Save Card
              </button>
              <span className="fc-form-hint">Ctrl+Enter to save</span>
            </div>
          </div>

          <div className="fc-recent-cards">
            <h3>Recently Added</h3>
            {deckCards.slice(-3).reverse().map(card => (
              <div key={card.id} className="fc-recent-card">
                <span className="fc-recent-front">{card.front}</span>
                <span className="fc-recent-arrow">→</span>
                <span className="fc-recent-back">{card.back}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Study Mode */}
      {mode === 'study' && currentCard && (
        <div className="fc-study-view">
          <div className="fc-study-header">
            <button className="fc-exit-study" onClick={endStudy}>
              ✕ Exit
            </button>
            <div className="fc-study-progress">
              <span>{currentCardIndex + 1} / {shuffledCards.length}</span>
              <div className="fc-study-progress-bar">
                <div
                  className="fc-study-progress-fill"
                  style={{ width: `${((currentCardIndex) / shuffledCards.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div
            className={`fc-study-card ${isFlipped ? 'flipped' : ''}`}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div className="fc-study-card-inner">
              <div className="fc-study-card-front">
                <span className="fc-card-label">Question</span>
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
                <span className="fc-action-icon">✗</span>
                <span>Still Learning</span>
                <span className="fc-action-key">← or A</span>
              </button>
              <button className="fc-action-known" onClick={handleKnown}>
                <span className="fc-action-icon">✓</span>
                <span>Got It!</span>
                <span className="fc-action-key">→ or D</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results View */}
      {mode === 'results' && (
        <div className="fc-results-view">
          <div className="fc-results-content">
            <h2>Study Complete! 🎉</h2>

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
                ? "Perfect! You've mastered all cards! 🌟"
                : `Keep practicing! ${studyStats.unknown} cards need more review.`}
            </div>

            <div className="fc-results-actions">
              <button className="fc-study-again" onClick={startStudy}>
                Study Again
              </button>
              <button className="fc-back-to-deck" onClick={endStudy}>
                Back to Deck
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FlashCards;
