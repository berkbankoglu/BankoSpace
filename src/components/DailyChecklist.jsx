import { useState, useEffect, useRef } from 'react';
import './DailyChecklist.css';

function DailyChecklist({ storageKey = 'dailyChecklist' }) {
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}Items`);
    return saved ? JSON.parse(saved) : [];
  });

  const [lastResetDate, setLastResetDate] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}LastReset`);
    return saved || new Date().toDateString();
  });

  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const inputRef = useRef(null);

  // Check if we need to reset for a new day (only for daily checklist)
  useEffect(() => {
    if (storageKey === 'dailyChecklist') {
      const today = new Date().toDateString();
      if (today !== lastResetDate) {
        const resetItems = items.map(item => ({ ...item, completed: false }));
        setItems(resetItems);
        setLastResetDate(today);
        localStorage.setItem(`${storageKey}LastReset`, today);
        localStorage.setItem(`${storageKey}Items`, JSON.stringify(resetItems));
      }
    }
  }, []);

  // Save items to localStorage
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
      // Input'a focus ver ki kullanıcı yazmaya devam edebilsin
      setTimeout(() => inputRef.current?.focus(), 0);
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

  const completedCount = items.filter(item => item.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="checklist-wrapper">
      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="checklist-progress">
          <div className="checklist-progress-bar">
            <div
              className="checklist-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="checklist-progress-text">
            {completedCount}/{totalCount} completed
          </span>
        </div>
      )}

      {/* Items List */}
      <div className="checklist-items">
        {items.map(item => (
          <div
            key={item.id}
            className={`checklist-item ${item.completed ? 'completed' : ''}`}
          >
            {editingId === item.id ? (
              <div className="checklist-edit-row">
                <input
                  type="text"
                  className="checklist-edit-input"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(item.id);
                    if (e.key === 'Escape') {
                      setEditingId(null);
                      setEditingText('');
                    }
                  }}
                  autoFocus
                />
                <button className="checklist-save-btn" onClick={() => saveEdit(item.id)}>
                  ✓
                </button>
              </div>
            ) : (
              <>
                <label className="checklist-label">
                  <input
                    type="checkbox"
                    className="checklist-checkbox"
                    checked={item.completed}
                    onChange={() => toggleItem(item.id)}
                  />
                  <span className="checklist-checkmark"></span>
                  <span className="checklist-text">{item.text}</span>
                </label>
                <div className="checklist-actions">
                  <button
                    className="checklist-action-btn edit"
                    onClick={() => startEditing(item)}
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    className="checklist-action-btn delete"
                    onClick={() => deleteItem(item.id)}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add New Item - Always visible */}
      <div className="checklist-add-row">
        <input
          ref={inputRef}
          type="text"
          className="checklist-add-input"
          placeholder="Add task and press Enter..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newItemText.trim()) {
              e.preventDefault();
              addItem();
            }
          }}
        />
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div className="checklist-empty">
          <span>No tasks yet. Add your first task above!</span>
        </div>
      )}
    </div>
  );
}

export default DailyChecklist;
