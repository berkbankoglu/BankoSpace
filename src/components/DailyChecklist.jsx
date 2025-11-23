import { useState, useEffect } from 'react';

function DailyChecklist({ storageKey = 'dailyChecklist' }) {
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}Items`);
    return saved ? JSON.parse(saved) : [
      { id: 1, text: 'Morning Exercise', completed: false },
      { id: 2, text: 'Read 30 pages', completed: false },
      { id: 3, text: 'Review notes', completed: false },
      { id: 4, text: 'Drink 8 glasses of water', completed: false },
      { id: 5, text: 'Plan tomorrow', completed: false }
    ];
  });

  const [lastResetDate, setLastResetDate] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}LastReset`);
    return saved || new Date().toDateString();
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  // Check if we need to reset for a new day
  useEffect(() => {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
      // Reset all items to uncompleted
      const resetItems = items.map(item => ({ ...item, completed: false }));
      setItems(resetItems);
      setLastResetDate(today);
      localStorage.setItem(`${storageKey}LastReset`, today);
      localStorage.setItem(`${storageKey}Items`, JSON.stringify(resetItems));
    }
  }, []);

  // Save items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`${storageKey}Items`, JSON.stringify(items));
  }, [items, storageKey]);

  const toggleItem = (id) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const addItem = () => {
    if (newItemText.trim()) {
      const newItem = {
        id: Date.now(),
        text: newItemText.trim(),
        completed: false
      };
      setItems([...items, newItem]);
      setNewItemText('');
      setShowAddForm(false);
    }
  };

  const deleteItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const startEditing = (item) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  const saveEdit = (id) => {
    if (editingText.trim()) {
      setItems(items.map(item =>
        item.id === id ? { ...item, text: editingText.trim() } : item
      ));
    }
    setEditingId(null);
    setEditingText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  return (
    <div className="daily-checklist-content">
          <div className="daily-checklist-items">
            {items.map(item => (
              <div
                key={item.id}
                className={`checklist-item ${item.completed ? 'completed' : ''}`}
              >
                {editingId === item.id ? (
                  <div className="checklist-edit-form">
                    <input
                      type="text"
                      className="checklist-edit-input"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') saveEdit(item.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                    />
                    <div className="checklist-edit-buttons">
                      <button
                        className="checklist-save-btn"
                        onClick={() => saveEdit(item.id)}
                      >
                        ✓
                      </button>
                      <button
                        className="checklist-cancel-btn"
                        onClick={cancelEdit}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      type="checkbox"
                      className="checklist-checkbox"
                      checked={item.completed}
                      onChange={() => toggleItem(item.id)}
                    />
                    <span
                      className="checklist-text"
                      onDoubleClick={() => startEditing(item)}
                    >
                      {item.text}
                    </span>
                    <div className="checklist-actions">
                      <button
                        className="checklist-edit-btn"
                        onClick={() => startEditing(item)}
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        className="checklist-delete-btn"
                        onClick={() => deleteItem(item.id)}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {showAddForm ? (
            <div className="checklist-add-form">
              <input
                type="text"
                className="checklist-add-input"
                placeholder="New daily task..."
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') addItem();
                  if (e.key === 'Escape') {
                    setShowAddForm(false);
                    setNewItemText('');
                  }
                }}
                autoFocus
              />
              <div className="checklist-add-buttons">
                <button className="checklist-add-save-btn" onClick={addItem}>
                  Add
                </button>
                <button
                  className="checklist-add-cancel-btn"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewItemText('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="checklist-new-btn"
              onClick={() => setShowAddForm(true)}
            >
              + Add Daily Task
            </button>
          )}
    </div>
  );
}

export default DailyChecklist;
