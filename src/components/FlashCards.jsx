import { useState, useEffect } from 'react';

function FlashCards() {
  const [cards, setCards] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('General');
  const [deletingCards, setDeletingCards] = useState([]);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [allGroups, setAllGroups] = useState([]);
  const [shuffleMode, setShuffleMode] = useState(false);
  const [studyFilter, setStudyFilter] = useState('all'); // 'all', 'known', 'unknown'

  // Load cards from localStorage with migration
  useEffect(() => {
    const saved = localStorage.getItem('flashCards');
    if (saved) {
      const loadedCards = JSON.parse(saved);
      // Migration: Add default fields to cards
      const migratedCards = loadedCards.map(card => ({
        ...card,
        group: card.group || 'General',
        lastStudied: card.lastStudied || null,
        known: card.known !== undefined ? card.known : null, // null, true, false
        studyCount: card.studyCount || 0
      }));
      setCards(migratedCards);
    }

    // Load saved groups
    const savedGroups = localStorage.getItem('flashCardGroups');
    if (savedGroups) {
      setAllGroups(JSON.parse(savedGroups));
    }
  }, []);

  // Save cards to localStorage
  useEffect(() => {
    localStorage.setItem('flashCards', JSON.stringify(cards));
  }, [cards]);

  // Save groups to localStorage
  useEffect(() => {
    localStorage.setItem('flashCardGroups', JSON.stringify(allGroups));
  }, [allGroups]);

  const nextCard = () => {
    if (filteredCards.length === 0) return;
    const currentIndex = filteredCards.findIndex(c => c.id === currentCard?.id);
    const nextIndex = (currentIndex + 1) % filteredCards.length;
    setCurrentCard(filteredCards[nextIndex]);
    setIsFlipped(false);
  };

  const prevCard = () => {
    if (filteredCards.length === 0) return;
    const currentIndex = filteredCards.findIndex(c => c.id === currentCard?.id);
    const prevIndex = currentIndex === -1 || currentIndex === 0 ? filteredCards.length - 1 : currentIndex - 1;
    setCurrentCard(filteredCards[prevIndex]);
    setIsFlipped(false);
  };

  // Keyboard shortcuts - Space to flip, Arrow keys to navigate
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only work in study mode (when currentCard is set) and not editing
      if (!currentCard || showAddForm || editingGroupId !== null) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prevCard();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentCard, showAddForm, editingGroupId, nextCard, prevCard]);

  // Get unique groups from cards AND tracked empty groups
  const getGroups = () => {
    const groupsFromCards = [...new Set(cards.map(card => card.group))];
    const allUniqueGroups = [...new Set([...allGroups, ...groupsFromCards])];
    return allUniqueGroups.sort();
  };

  // Filter cards by selected group
  const filteredCards = cards.filter(card => card.group === selectedGroup);

  const addCard = () => {
    if (newFront.trim() && newBack.trim()) {
      const group = selectedGroup;
      const card = {
        id: Date.now(),
        front: newFront.trim(),
        back: newBack.trim(),
        group: group,
        createdAt: Date.now(),
        lastStudied: null,
        known: null,
        studyCount: 0
      };
      setCards([...cards, card]);
      setNewFront('');
      setNewBack('');
      // Keep form open and focus front input for next card
      setTimeout(() => {
        const frontInput = document.querySelector('.fc-front-input');
        if (frontInput) frontInput.focus();
      }, 0);
    }
  };

  const deleteCard = (id) => {
    // Animasyon başlat
    setDeletingCards(prev => [...prev, id]);

    // Animasyon bitince sil
    setTimeout(() => {
      setCards(cards.filter(card => card.id !== id));
      setDeletingCards(prev => prev.filter(cardId => cardId !== id));
      if (currentCard?.id === id) {
        setCurrentCard(null);
      }
    }, 300);
  };

  // Get study cards based on filter
  const getStudyCards = () => {
    let cardsToStudy = filteredCards;

    // Apply study filter
    if (studyFilter === 'known') {
      cardsToStudy = cardsToStudy.filter(card => card.known === true);
    } else if (studyFilter === 'unknown') {
      cardsToStudy = cardsToStudy.filter(card => card.known === false || card.known === null);
    }

    // Apply shuffle if enabled
    if (shuffleMode) {
      cardsToStudy = [...cardsToStudy].sort(() => Math.random() - 0.5);
    }

    return cardsToStudy;
  };

  const startStudy = () => {
    const studyCards = getStudyCards();
    if (studyCards.length > 0) {
      setCurrentCard(studyCards[0]);
      setIsFlipped(false);
    }
  };

  const markCardKnown = (known) => {
    if (!currentCard) return;

    setCards(cards.map(card =>
      card.id === currentCard.id
        ? {
            ...card,
            known: known,
            lastStudied: Date.now(),
            studyCount: card.studyCount + 1
          }
        : card
    ));

    // Move to next card
    nextCard();
  };

  const addNewGroup = () => {
    // Generate unique group name
    let groupNumber = 1;
    let groupName = `Group ${groupNumber}`;
    const existingGroups = getGroups();

    while (existingGroups.includes(groupName)) {
      groupNumber++;
      groupName = `Group ${groupNumber}`;
    }

    // Add to tracked groups
    setAllGroups([...allGroups, groupName]);
    setSelectedGroup(groupName);
  };

  const deleteGroup = (groupName, e) => {
    e.stopPropagation();
    if (window.confirm(`Delete group "${groupName}" and all its ${cards.filter(c => c.group === groupName).length} cards?`)) {
      setCards(cards.filter(card => card.group !== groupName));
      setAllGroups(allGroups.filter(g => g !== groupName));
      if (selectedGroup === groupName) {
        setSelectedGroup('all');
      }
      setCurrentCard(null);
    }
  };

  const renameGroup = (oldName, newName) => {
    if (newName && newName.trim() && newName !== oldName && !getGroups().includes(newName.trim())) {
      setCards(cards.map(card =>
        card.group === oldName ? { ...card, group: newName.trim() } : card
      ));
      setAllGroups(allGroups.map(g => g === oldName ? newName.trim() : g));
      if (selectedGroup === oldName) {
        setSelectedGroup(newName.trim());
      }
    }
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  // Change card group
  const changeCardGroup = (cardId, newGroup) => {
    setCards(cards.map(card =>
      card.id === cardId ? { ...card, group: newGroup } : card
    ));
  };

  return (
    <div className="flashcards-container">
      <div className="flashcards-header">
        <div className="fc-header-buttons">
          <button
            onClick={() => setShuffleMode(!shuffleMode)}
            className={`fc-toggle-btn ${shuffleMode ? 'active' : ''}`}
            title="Shuffle cards"
          >
            🔀 {shuffleMode ? 'Shuffle: ON' : 'Shuffle: OFF'}
          </button>
          <select
            value={studyFilter}
            onChange={(e) => setStudyFilter(e.target.value)}
            className="fc-filter-select"
            title="Filter cards"
          >
            <option value="all">All Cards</option>
            <option value="unknown">Unknown Only</option>
            <option value="known">Known Only</option>
          </select>
          <button
            onClick={(e) => deleteGroup(selectedGroup, e)}
            className="fc-delete-group-btn"
            title="Delete current group"
          >
            Delete Group
          </button>
          <button onClick={startStudy} className="fc-study-btn-header" disabled={getStudyCards().length === 0}>
            Start Studying ({getStudyCards().length})
          </button>
        </div>
      </div>

      {/* Group Tabs */}
      <div className="fc-group-tabs">
        {getGroups().map(group => (
          <div
            key={group}
            className={`fc-group-tab ${selectedGroup === group ? 'active' : ''}`}
            onClick={() => {
              if (editingGroupId !== group) {
                setSelectedGroup(group);
                setCurrentCard(null);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingGroupId(group);
              setEditingGroupName(group);
            }}
          >
            {editingGroupId === group ? (
              <input
                type="text"
                value={editingGroupName}
                onChange={(e) => setEditingGroupName(e.target.value)}
                onBlur={() => renameGroup(group, editingGroupName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameGroup(group, editingGroupName);
                  if (e.key === 'Escape') {
                    setEditingGroupId(null);
                    setEditingGroupName('');
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#2a2a2a',
                  border: '1px solid #667eea',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  color: '#e0e0e0',
                  fontSize: '13px',
                  width: '100px'
                }}
              />
            ) : (
              <>
                <span>{group} ({cards.filter(c => c.group === group).length})</span>
                <button
                  className="fc-group-tab-delete"
                  onClick={(e) => deleteGroup(group, e)}
                  title="Delete group"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
        <div className="fc-group-tab fc-group-tab-add" onClick={addNewGroup}>
          + New Group
        </div>
      </div>

      {/* Keyboard Shortcuts Hints */}
      <div className="fc-hints">
        <div className="fc-hint-item">
          <span className="fc-hint-key">Double Click</span>
          <span className="fc-hint-desc">Rename group</span>
        </div>
        <div className="fc-hint-item">
          <span className="fc-hint-key">Drag & Drop</span>
          <span className="fc-hint-desc">Move card to different group</span>
        </div>
        <div className="fc-hint-item">
          <span className="fc-hint-key">Space</span>
          <span className="fc-hint-desc">Flip card</span>
        </div>
        <div className="fc-hint-item">
          <span className="fc-hint-key">← →</span>
          <span className="fc-hint-desc">Previous / Next card</span>
        </div>
        <div className="fc-hint-item">
          <span className="fc-hint-key">Enter</span>
          <span className="fc-hint-desc">Save card / Navigate</span>
        </div>
      </div>

      {showAddForm && (
        <div className="fc-add-form">
          <textarea
            className="fc-front-input"
            placeholder="Front side (question/term)"
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && document.querySelector('.fc-back-input').focus()}
            rows="1"
            style={{ minHeight: '44px', resize: 'none', overflow: 'hidden' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
          />
          <textarea
            className="fc-back-input"
            placeholder="Back side (answer/definition)"
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addCard()}
            rows="3"
            style={{ minHeight: '80px', resize: 'vertical' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
          />
          <button onClick={addCard} className="fc-save-btn">Save</button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="fc-list">
          <button onClick={() => setShowAddForm(!showAddForm)} className="fc-add-btn-list">
            {showAddForm ? '✕ Close' : '+ New Card'}
          </button>
          <div className="fc-empty">
            No flash cards yet. Add a new card to get started!
          </div>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="fc-list">
          <button onClick={() => setShowAddForm(!showAddForm)} className="fc-add-btn-list">
            {showAddForm ? '✕ Close' : '+ New Card'}
          </button>
          <div className="fc-empty">
            No cards in this group. Select a different group or add new cards.
          </div>
        </div>
      ) : (
        <>
          <div className="fc-stats">
            {selectedGroup === 'all'
              ? `Total ${cards.length} cards`
              : `${filteredCards.length} cards in ${selectedGroup}`
            }
          </div>

          {currentCard ? (
            <div className="fc-study-mode">
              <div className="fc-card-info">
                <div className="fc-card-group-badge">{currentCard.group}</div>
                {currentCard.lastStudied && (
                  <div className="fc-last-studied">
                    Last: {new Date(currentCard.lastStudied).toLocaleDateString()}
                  </div>
                )}
                {currentCard.studyCount > 0 && (
                  <div className="fc-study-count">
                    Studied: {currentCard.studyCount}x
                  </div>
                )}
              </div>
              <div
                className={`fc-card ${isFlipped ? 'flipped' : ''}`}
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <div className="fc-card-inner">
                  <div className="fc-card-front">
                    {currentCard.front}
                  </div>
                  <div className="fc-card-back">
                    {currentCard.back}
                  </div>
                </div>
              </div>

              <div className="fc-know-buttons">
                <button onClick={() => markCardKnown(false)} className="fc-know-btn fc-dont-know">
                  ❌ Don't Know
                </button>
                <button onClick={() => markCardKnown(true)} className="fc-know-btn fc-know">
                  ✅ I Know
                </button>
              </div>

              <div className="fc-controls">
                <button onClick={prevCard} className="fc-nav-btn">◀ Previous</button>
                <button onClick={() => setCurrentCard(null)} className="fc-exit-btn">List</button>
                <button onClick={nextCard} className="fc-nav-btn">Next ▶</button>
              </div>
            </div>
          ) : (
            <div className="fc-list">
              <button onClick={() => setShowAddForm(!showAddForm)} className="fc-add-btn-list">
                {showAddForm ? '✕ Close' : '+ New Card'}
              </button>

              <div className="fc-list-items">
                {filteredCards.map((card) => (
                  <div
                    key={card.id}
                    className={`fc-list-item ${deletingCards.includes(card.id) ? 'deleting' : ''}`}
                  >
                    <div className="fc-list-content">
                      <div className="fc-list-header">
                        <select
                          value={card.group}
                          onChange={(e) => changeCardGroup(card.id, e.target.value)}
                          className="fc-group-selector"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {getGroups().map(group => (
                            <option key={group} value={group}>{group}</option>
                          ))}
                        </select>
                        {card.known !== null && (
                          <div className={`fc-list-status ${card.known ? 'known' : 'unknown'}`}>
                            {card.known ? '✅' : '❌'}
                          </div>
                        )}
                      </div>
                      <div className="fc-list-front">{card.front}</div>
                      <div className="fc-list-back">{card.back}</div>
                      {card.lastStudied && (
                        <div className="fc-list-meta">
                          Last: {new Date(card.lastStudied).toLocaleDateString()} • Studied: {card.studyCount}x
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteCard(card.id)}
                      className="fc-delete-btn"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FlashCards;
