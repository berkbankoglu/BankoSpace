import { useState, useEffect, useRef } from 'react';
import './DailyChecklist.css';
import { playTypeSoundThrottled, playCompleteSound, playUncompleteSound, playDeleteSound, playAddSound } from '../utils/sounds';

function DailyChecklist({ storageKey = 'dailyChecklist', title, onTitleChange }) {
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}Items`);
    return saved ? JSON.parse(saved) : [];
  });

  const [lastResetDate, setLastResetDate] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}LastReset`);
    return saved || new Date().toDateString();
  });

  const [color, setColor] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}Color`);
    return saved || '#667eea';
  });

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(title || 'Checklist');
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const inputRef = useRef(null);

  const colors = [
    '#667eea', '#f093fb', '#4ade80', '#60a5fa',
    '#fb923c', '#f87171', '#58a6ff', '#9ca3af'
  ];

  // Save color to localStorage
  useEffect(() => {
    localStorage.setItem(`${storageKey}Color`, color);
  }, [color, storageKey]);

  // Update title value when prop changes
  useEffect(() => {
    setTitleValue(title || 'Checklist');
  }, [title]);

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
    const item = items.find(i => i.id === id);
    if (item) { item.completed ? playUncompleteSound() : playCompleteSound(); }
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
      playAddSound();
      // Input'a focus ver ki kullanıcı yazmaya devam edebilsin
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const deleteItem = (id) => {
    playDeleteSound();
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

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (onTitleChange && titleValue.trim()) {
      onTitleChange(titleValue.trim());
    }
  };

  return (
    <div className="checklist-wrapper" style={{ '--checklist-color': color }}>
      {/* Header with color and title */}
      <div className="checklist-header">
        <div className="checklist-header-left">
          <div
            className="checklist-color-dot"
            style={{ background: color }}
            onClick={() => setShowColorPicker(!showColorPicker)}
          />
          {editingTitle ? (
            <input
              type="text"
              className="checklist-title-input"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave();
                if (e.key === 'Escape') {
                  setTitleValue(title || 'Checklist');
                  setEditingTitle(false);
                }
              }}
              autoFocus
            />
          ) : (
            <h3
              className="checklist-title"
              onDoubleClick={() => setEditingTitle(true)}
            >
              {titleValue}
            </h3>
          )}
        </div>
        {totalCount > 0 && (
          <span className="checklist-count">{completedCount}/{totalCount}</span>
        )}
      </div>

      {/* Color Picker */}
      {showColorPicker && (
        <div className="checklist-color-picker">
          {colors.map(c => (
            <div
              key={c}
              className={`checklist-color-swatch ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setShowColorPicker(false);
              }}
            />
          ))}
        </div>
      )}

      {/* Add New Item - At top */}
      <div className="checklist-add-row">
        <input
          ref={inputRef}
          type="text"
          className="checklist-add-input"
          placeholder="Add task and press Enter..."
          value={newItemText}
          onChange={(e) => { playTypeSoundThrottled(); setNewItemText(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newItemText.trim()) {
              e.preventDefault();
              addItem();
            }
          }}
        />
      </div>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="checklist-progress">
          <div className="checklist-progress-bar">
            <div
              className="checklist-progress-fill"
              style={{ width: `${progress}%`, background: color }}
            />
          </div>
        </div>
      )}

      {/* Items List or Empty State */}
      <div className="checklist-items">
        {items.length === 0 ? (
          <div className="checklist-empty">
            <span>No tasks yet. Add your first task below!</span>
          </div>
        ) : (
          items.map(item => (
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
                    onChange={(e) => { playTypeSoundThrottled(); setEditingText(e.target.value); }}
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
          ))
        )}
      </div>

    </div>
  );
}

export default DailyChecklist;
