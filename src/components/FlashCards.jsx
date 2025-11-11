import { useState, useEffect } from 'react';

function FlashCards() {
  const [cards, setCards] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [deletingCards, setDeletingCards] = useState([]);

  // Load cards from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('flashCards');
    if (saved) {
      setCards(JSON.parse(saved));
    }
  }, []);

  // Save cards to localStorage
  useEffect(() => {
    localStorage.setItem('flashCards', JSON.stringify(cards));
  }, [cards]);

  const addCard = () => {
    if (newFront.trim() && newBack.trim()) {
      const card = {
        id: Date.now(),
        front: newFront.trim(),
        back: newBack.trim(),
        createdAt: Date.now()
      };
      setCards([...cards, card]);
      setNewFront('');
      setNewBack('');
      setShowAddForm(false);
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

  const nextCard = () => {
    if (cards.length === 0) return;
    const currentIndex = cards.findIndex(c => c.id === currentCard?.id);
    const nextIndex = (currentIndex + 1) % cards.length;
    setCurrentCard(cards[nextIndex]);
    setIsFlipped(false);
  };

  const prevCard = () => {
    if (cards.length === 0) return;
    const currentIndex = cards.findIndex(c => c.id === currentCard?.id);
    const prevIndex = currentIndex === -1 || currentIndex === 0 ? cards.length - 1 : currentIndex - 1;
    setCurrentCard(cards[prevIndex]);
    setIsFlipped(false);
  };

  const startStudy = () => {
    if (cards.length > 0) {
      setCurrentCard(cards[0]);
      setIsFlipped(false);
    }
  };

  return (
    <div className="flashcards-container">
      <div className="flashcards-header">
        <h3>Flash Cards</h3>
        <button onClick={() => setShowAddForm(!showAddForm)} className="fc-add-btn">
          {showAddForm ? '✕ Close' : '+ New Card'}
        </button>
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
        <div className="fc-empty">
          No flash cards yet. Add a new card to get started!
        </div>
      ) : (
        <>
          <div className="fc-stats">
            Total {cards.length} cards
          </div>

          {currentCard ? (
            <div className="fc-study-mode">
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

              <div className="fc-controls">
                <button onClick={prevCard} className="fc-nav-btn">◀ Previous</button>
                <button onClick={() => setCurrentCard(null)} className="fc-exit-btn">List</button>
                <button onClick={nextCard} className="fc-nav-btn">Next ▶</button>
              </div>
            </div>
          ) : (
            <div className="fc-list">
              <button onClick={startStudy} className="fc-study-btn">
                📚 Start Studying
              </button>

              <div className="fc-list-items">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className={`fc-list-item ${deletingCards.includes(card.id) ? 'deleting' : ''}`}
                  >
                    <div className="fc-list-content">
                      <div className="fc-list-front">{card.front}</div>
                      <div className="fc-list-back">{card.back}</div>
                    </div>
                    <button
                      onClick={() => deleteCard(card.id)}
                      className="fc-delete-btn"
                      title="Delete"
                    >
                      🗑️
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
