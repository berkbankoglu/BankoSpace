import { useState, useEffect } from 'react';

function FlashCards() {
  const [cards, setCards] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('General');
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [allGroups, setAllGroups] = useState([]);

  // Load cards from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('flashCards');
    if (saved) {
      const loadedCards = JSON.parse(saved);
      const migratedCards = loadedCards.map(card => ({
        ...card,
        group: card.group || 'General',
        known: card.known !== undefined ? card.known : null,
      }));
      setCards(migratedCards);
    }

    const savedGroups = localStorage.getItem('flashCardGroups');
    if (savedGroups) {
      setAllGroups(JSON.parse(savedGroups));
    }
  }, []);

  // Save cards and groups
  useEffect(() => {
    localStorage.setItem('flashCards', JSON.stringify(cards));
  }, [cards]);

  useEffect(() => {
    localStorage.setItem('flashCardGroups', JSON.stringify(allGroups));
  }, [allGroups]);

  const nextCard = () => {
    const filteredCards = cards.filter(c => c.group === selectedGroup);
    if (filteredCards.length === 0) return;
    const currentIndex = filteredCards.findIndex(c => c.id === currentCard?.id);
    const nextIndex = (currentIndex + 1) % filteredCards.length;
    setCurrentCard(filteredCards[nextIndex]);
    setIsFlipped(false);
  };

  const prevCard = () => {
    const filteredCards = cards.filter(c => c.group === selectedGroup);
    if (filteredCards.length === 0) return;
    const currentIndex = filteredCards.findIndex(c => c.id === currentCard?.id);
    const prevIndex = currentIndex === -1 || currentIndex === 0 ? filteredCards.length - 1 : currentIndex - 1;
    setCurrentCard(filteredCards[prevIndex]);
    setIsFlipped(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
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
  }, [currentCard, showAddForm, editingGroupId]);

  const getGroups = () => {
    const groupsFromCards = [...new Set(cards.map(card => card.group))];
    const allUniqueGroups = [...new Set([...allGroups, ...groupsFromCards])];
    return allUniqueGroups.sort();
  };

  const filteredCards = cards.filter(card => card.group === selectedGroup);

  const addCard = () => {
    if (newFront.trim() && newBack.trim()) {
      const card = {
        id: Date.now(),
        front: newFront.trim(),
        back: newBack.trim(),
        group: selectedGroup,
        known: null,
      };
      setCards([...cards, card]);
      setNewFront('');
      setNewBack('');
      setTimeout(() => {
        document.querySelector('.fc-front-input')?.focus();
      }, 0);
    }
  };

  const deleteCard = (id) => {
    setCards(cards.filter(card => card.id !== id));
    if (currentCard?.id === id) {
      setCurrentCard(null);
    }
  };

  const startStudy = () => {
    if (filteredCards.length > 0) {
      setCurrentCard(filteredCards[0]);
      setIsFlipped(false);
    }
  };

  const markCardKnown = (known) => {
    if (!currentCard) return;
    setCards(cards.map(card =>
      card.id === currentCard.id ? { ...card, known } : card
    ));
    nextCard();
  };

  const addNewGroup = () => {
    let groupNumber = 1;
    let groupName = `Group ${groupNumber}`;
    const existingGroups = getGroups();

    while (existingGroups.includes(groupName)) {
      groupNumber++;
      groupName = `Group ${groupNumber}`;
    }

    setAllGroups([...allGroups, groupName]);
    setSelectedGroup(groupName);
  };

  const deleteGroup = (groupName) => {
    if (window.confirm(`Delete group "${groupName}" and all its ${cards.filter(c => c.group === groupName).length} cards?`)) {
      setCards(cards.filter(card => card.group !== groupName));
      setAllGroups(allGroups.filter(g => g !== groupName));
      if (selectedGroup === groupName) {
        const groups = getGroups().filter(g => g !== groupName);
        setSelectedGroup(groups[0] || 'General');
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

  return (
    <div className="flashcards-container">
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
            onDoubleClick={() => {
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
                className="fc-group-input"
              />
            ) : (
              <>
                {group} ({cards.filter(c => c.group === group).length})
                <button
                  className="fc-group-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGroup(group);
                  }}
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
        <button className="fc-group-add" onClick={addNewGroup}>+</button>
      </div>

      {/* Study Mode */}
      {currentCard ? (
        <div className="fc-study-mode">
          <div
            className={`fc-card ${isFlipped ? 'flipped' : ''}`}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div className="fc-card-inner">
              <div className="fc-card-front">{currentCard.front}</div>
              <div className="fc-card-back">{currentCard.back}</div>
            </div>
          </div>

          <div className="fc-nav">
            <button onClick={prevCard} className="fc-nav-btn">←</button>
            <button onClick={() => setCurrentCard(null)} className="fc-list-btn">List</button>
            <button onClick={nextCard} className="fc-nav-btn">→</button>
          </div>

          <div className="fc-know-btns">
            <button onClick={() => markCardKnown(false)} className="fc-no">✗</button>
            <button onClick={() => markCardKnown(true)} className="fc-yes">✓</button>
          </div>
        </div>
      ) : (
        <>
          {/* Add Card Form */}
          {showAddForm && (
            <div className="fc-add-form">
              <input
                className="fc-front-input"
                placeholder="Question"
                value={newFront}
                onChange={(e) => setNewFront(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && document.querySelector('.fc-back-input')?.focus()}
              />
              <textarea
                className="fc-back-input"
                placeholder="Answer"
                value={newBack}
                onChange={(e) => setNewBack(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addCard()}
                rows="2"
              />
              <button onClick={addCard} className="fc-save">Save</button>
            </div>
          )}

          {/* Card List */}
          <div className="fc-list">
            <div className="fc-list-header">
              <button onClick={() => setShowAddForm(!showAddForm)} className="fc-add-btn">
                {showAddForm ? '×' : '+'}
              </button>
              {filteredCards.length > 0 && (
                <button onClick={startStudy} className="fc-study-btn">
                  Study ({filteredCards.length})
                </button>
              )}
            </div>

            {filteredCards.length === 0 ? (
              <div className="fc-empty">No cards yet</div>
            ) : (
              <div className="fc-items">
                {filteredCards.map((card) => (
                  <div key={card.id} className="fc-item">
                    <div className="fc-item-content">
                      <div className="fc-item-front">{card.front}</div>
                      <div className="fc-item-back">{card.back}</div>
                    </div>
                    {card.known !== null && (
                      <div className={`fc-item-status ${card.known ? 'known' : 'unknown'}`}>
                        {card.known ? '✓' : '✗'}
                      </div>
                    )}
                    <button onClick={() => deleteCard(card.id)} className="fc-delete">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default FlashCards;
