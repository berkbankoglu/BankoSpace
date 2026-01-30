import { useState, useRef } from 'react';
import './CategoryColumn.css';

function CategoryColumn({ title, category, todos, onAddTodo, onToggleTodo, onDeleteTodo, currentFilter, onRename, onAddSubtask, onToggleSubtask, onDeleteSubtask, onReorder }) {
  const [inputValue, setInputValue] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);
  const [expandedTodo, setExpandedTodo] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState('');
  const inputRef = useRef(null);
  const subtaskInputRef = useRef(null);

  const activeCount = todos.filter(t => !t.completed).length;
  const completedCount = todos.filter(t => t.completed).length;
  const totalCount = todos.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAddTodo(category, inputValue.trim());
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleTitleDoubleClick = () => {
    setIsEditingTitle(true);
    setEditTitleValue(title);
  };

  const handleTitleSave = () => {
    if (editTitleValue.trim() && editTitleValue !== title) {
      onRename(category, editTitleValue.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyPress = (e) => {
    if (e.key === 'Enter') handleTitleSave();
    else if (e.key === 'Escape') {
      setEditTitleValue(title);
      setIsEditingTitle(false);
    }
  };

  const toggleExpand = (todoId) => {
    setExpandedTodo(expandedTodo === todoId ? null : todoId);
    setSubtaskInput('');
  };

  const handleAddSubtask = (todoId) => {
    if (subtaskInput.trim()) {
      onAddSubtask(todoId, subtaskInput.trim());
      setSubtaskInput('');
      setTimeout(() => subtaskInputRef.current?.focus(), 0);
    }
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const created = new Date(timestamp);
    const diffMs = now - created;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Şimdi';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return created.toLocaleDateString('tr-TR');
  };

  const sortedTodos = [...todos].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="category-column-v2">
      {/* Header */}
      <div className="cc-header">
        {isEditingTitle ? (
          <input
            type="text"
            className="cc-title-input"
            value={editTitleValue}
            onChange={(e) => setEditTitleValue(e.target.value)}
            onKeyDown={handleTitleKeyPress}
            onBlur={handleTitleSave}
            autoFocus
          />
        ) : (
          <h3 className="cc-title" onDoubleClick={handleTitleDoubleClick}>
            {title}
          </h3>
        )}
        <span className="cc-count">{activeCount}</span>
      </div>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="cc-progress">
          <div className="cc-progress-bar">
            <div className="cc-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="cc-progress-text">{completedCount}/{totalCount}</span>
        </div>
      )}

      {/* Todo Items */}
      <div className="cc-items">
        {sortedTodos.map((todo) => (
          <div key={todo.id} className={`cc-item ${todo.completed ? 'completed' : ''}`}>
            <div className="cc-item-main">
              <label className="cc-label">
                <input
                  type="checkbox"
                  className="cc-checkbox"
                  checked={todo.completed}
                  onChange={() => onToggleTodo(todo.id)}
                />
                <span className="cc-checkmark"></span>
                <span className="cc-text">{todo.text}</span>
              </label>
              <div className="cc-item-actions">
                {todo.subtasks && todo.subtasks.length > 0 && (
                  <span className="cc-subtask-badge">
                    {todo.subtasks.filter(s => s.completed).length}/{todo.subtasks.length}
                  </span>
                )}
                <button
                  className="cc-action-btn expand"
                  onClick={() => toggleExpand(todo.id)}
                  title="Subtasks"
                >
                  {expandedTodo === todo.id ? '−' : '+'}
                </button>
                <button
                  className="cc-action-btn delete"
                  onClick={() => onDeleteTodo(todo.id)}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="cc-item-meta">
              <span className="cc-time">{getTimeAgo(todo.createdAt)}</span>
            </div>

            {/* Subtasks */}
            {expandedTodo === todo.id && (
              <div className="cc-subtasks">
                {todo.subtasks && todo.subtasks.map((subtask) => (
                  <div key={subtask.id} className={`cc-subtask ${subtask.completed ? 'completed' : ''}`}>
                    <label className="cc-label">
                      <input
                        type="checkbox"
                        className="cc-checkbox small"
                        checked={subtask.completed}
                        onChange={() => onToggleSubtask(todo.id, subtask.id)}
                      />
                      <span className="cc-checkmark small"></span>
                      <span className="cc-text">{subtask.text}</span>
                    </label>
                    <button
                      className="cc-action-btn delete small"
                      onClick={() => onDeleteSubtask(todo.id, subtask.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="cc-subtask-add">
                  <input
                    ref={subtaskInputRef}
                    type="text"
                    className="cc-subtask-input"
                    placeholder="Add subtask..."
                    value={subtaskInput}
                    onChange={(e) => setSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && subtaskInput.trim()) {
                        e.preventDefault();
                        handleAddSubtask(todo.id);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {todos.length === 0 && (
        <div className="cc-empty">
          <span>No tasks yet</span>
        </div>
      )}

      {/* Add New Task - Always at Bottom */}
      <div className="cc-add-row">
        <input
          ref={inputRef}
          type="text"
          className="cc-add-input"
          placeholder="Add task and press Enter..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
        />
      </div>
    </div>
  );
}

export default CategoryColumn;
