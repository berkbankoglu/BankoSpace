import { useState, useEffect, useRef } from 'react';
import './FlashCards.css';

const DECK_COLORS = [
  '#58a6ff', '#7ee787', '#f85149', '#d29922', '#bc8cff',
  '#ff7b72', '#79c0ff', '#ffa657', '#f778ba', '#3fb950'
];

function FlashCards({ fullscreen = false }) {
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]); // Array of {name, color}
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [activeView, setActiveView] = useState('decks'); // 'decks', 'cards', 'study', 'results'
  const [editingCard, setEditingCard] = useState(null);
  const [editingDeckName, setEditingDeckName] = useState(null);
  const [editingDeckTitle, setEditingDeckTitle] = useState('');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyStats, setStudyStats] = useState({ known: 0, unknown: 0 });
  const [shuffledCards, setShuffledCards] = useState([]);
  const [newDeckName, setNewDeckName] = useState('');
  const [showNewDeckInput, setShowNewDeckInput] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(null);

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
      const loaded = JSON.parse(savedDecks);
      // Migrate old format (string array) to new format (object array)
      if (loaded.length > 0 && typeof loaded[0] === 'string') {
        setDecks(loaded.map((name, idx) => ({
          name,
          color: DECK_COLORS[idx % DECK_COLORS.length]
        })));
      } else {
        setDecks(loaded);
      }
    }
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem('flashCards', JSON.stringify(cards));
  }, [cards]);

  useEffect(() => {
    localStorage.setItem('flashCardGroups', JSON.stringify(decks));
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
  };

  const deleteDeck = (deckName) => {
    const cardCount = getDeckCards(deckName).length;
    if (!window.confirm(`Delete "${deckName}" and its ${cardCount} cards?`)) return;

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
    if (!window.confirm('Reset all progress for this deck?')) return;
    setCards(cards.map(c => c.group === selectedDeck ? { ...c, known: null } : c));
  };

  // Card operations
  const addCard = (front, back) => {
    if (!front.trim() || !back.trim()) return;

    const card = {
      id: Date.now(),
      front: front.trim(),
      back: back.trim(),
      group: selectedDeck,
      known: null,
      createdAt: Date.now()
    };
    setCards([...cards, card]);
    setEditingCard(null);
  };

  const updateCard = (cardId, front, back) => {
    if (!front.trim() || !back.trim()) return;

    setCards(cards.map(c =>
      c.id === cardId
        ? { ...c, front: front.trim(), back: back.trim() }
        : c
    ));
    setEditingCard(null);
  };

  const deleteCard = (id) => {
    if (!window.confirm('Delete this card?')) return;
    setCards(cards.filter(c => c.id !== id));
  };

  // Study operations
  const startStudy = () => {
    const deckCards = getDeckCards();
    if (deckCards.length === 0) return;

    const shuffled = [...deckCards].sort(() => Math.random() - 0.5);
    setShuffledCards(shuffled);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudyStats({ known: 0, unknown: 0 });
    setActiveView('study');
  };

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
      setActiveView('results');
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
      {/* Left Sidebar Menu */}
      <div className="fc-sidebar">
        <div className="fc-sidebar-header">
          <h2>Flash Cards</h2>
        </div>

        <div className="fc-menu">
          {/* New Deck Section */}
          <div className="fc-menu-section">
            {showNewDeckInput ? (
              <div className="fc-new-deck-form">
                <input
                  type="text"
                  placeholder="Deck name..."
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
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
                    >
                      <div className="fc-deck-item-color" style={{ backgroundColor: deck.color }} />
                      <div className="fc-deck-item-name">{deck.name}</div>
                      <div className="fc-deck-item-count">{deckStats.total}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="fc-content">
        {/* Decks Overview */}
        {activeView === 'decks' && (
          <div className="fc-main-view">
            <div className="fc-main-header">
              <h1>Flash Card Decks</h1>
            </div>
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
                    onChange={(e) => setEditingDeckTitle(e.target.value)}
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
                  <button className="fc-study-btn" onClick={startStudy}>
                    Study
                  </button>
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
                onSave={(front, back) => addCard(front, back)}
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
                <table className="fc-cards-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Front</th>
                      <th>Back</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deckCards.map((card, index) => (
                      <tr key={card.id}>
                        {editingCard === card.id ? (
                          <td colSpan="5">
                            <CardForm
                              initialFront={card.front}
                              initialBack={card.back}
                              onSave={(front, back) => updateCard(card.id, front, back)}
                              onCancel={() => setEditingCard(null)}
                            />
                          </td>
                        ) : (
                          <>
                            <td>{index + 1}</td>
                            <td>{card.front}</td>
                            <td>{card.back}</td>
                            <td>
                              <span className={`fc-status ${card.known === true ? 'known' : card.known === false ? 'unknown' : 'fresh'}`}>
                                {card.known === true ? '✓ Mastered' : card.known === false ? '✗ Learning' : '○ New'}
                              </span>
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
function CardForm({ initialFront = '', initialBack = '', onSave, onCancel }) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);

  const handleSave = () => {
    if (front.trim() && back.trim()) {
      onSave(front, back);
      setFront('');
      setBack('');
    }
  };

  return (
    <div className="fc-card-form">
      <input
        type="text"
        placeholder="Front (Question)"
        value={front}
        onChange={(e) => setFront(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <input
        type="text"
        placeholder="Back (Answer)"
        value={back}
        onChange={(e) => setBack(e.target.value)}
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
