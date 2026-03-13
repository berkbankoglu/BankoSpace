import { useState, useRef } from 'react';
import { flushSync } from 'react-dom';

function TodoItem({ todo, index, onToggle, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask, draggable, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [subtaskText, setSubtaskText] = useState('');
  const [showSubtasks, setShowSubtasks] = useState(true);
  const subtaskInputRef = useRef(null);

  const handleToggle = () => {
    if (!todo.completed) {
      setIsDeleting(true);
      setTimeout(() => {
        onToggle(todo.id);
      }, 400);
    } else {
      onToggle(todo.id);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setIsDeleting(true);
    setTimeout(() => {
      onDelete(todo.id);
    }, 400);
  };

  const handleAddSubtask = () => {
    if (subtaskText.trim()) {
      onAddSubtask(todo.id, subtaskText.trim());
      setSubtaskText('');
      setShowSubtaskInput(false);
    }
  };

  const handleSubtaskKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddSubtask();
    } else if (e.key === 'Escape') {
      setSubtaskText('');
      setShowSubtaskInput(false);
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const subtasks = todo.subtasks || [];
  const completedSubtasks = subtasks.filter(st => st.completed).length;
  const hasSubtasks = subtasks.length > 0;

  return (
    <li
      className={`todo-item ${todo.completed ? 'completed' : ''} ${isDeleting ? 'disintegrating' : ''} ${isDragging ? 'dragging' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="todo-header">
        <div className="todo-header-top">
          <div className="todo-reorder-buttons">
            {!isFirst && (
              <button
                className="todo-move-btn todo-move-up"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log('Move up clicked, index:', index);
                  onMoveUp(index);
                }}
                title="Move up"
              >
                ↑
              </button>
            )}
            {!isLast && (
              <button
                className="todo-move-btn todo-move-down"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log('Move down clicked, index:', index);
                  onMoveDown(index);
                }}
                title="Move down"
              >
                ↓
              </button>
            )}
          </div>
        </div>
        <div className="todo-content">
          <div className="todo-text-row">
            <div className="todo-text-row-top">
              <div
                className={`checkbox ${todo.completed ? 'checked' : ''}`}
                onClick={handleToggle}
              />
              {hasSubtasks && (
                <div className="subtask-progress">
                  ({completedSubtasks}/{subtasks.length})
                </div>
              )}
            </div>
            <div className="todo-text">{todo.text}</div>
          </div>
          <div className="todo-meta">
            <span className="created-date">{formatDate(todo.createdAt)}</span>
            <button
              className="subtask-toggle-btn"
              onClick={() => {
                const next = !showSubtaskInput;
                flushSync(() => setShowSubtaskInput(next));
                if (next) subtaskInputRef.current?.focus();
              }}
              title="Add subtask"
            >
              +
            </button>
            {hasSubtasks && (
              <button
                className="subtask-collapse-btn"
                onClick={() => setShowSubtasks(!showSubtasks)}
                title={showSubtasks ? "Hide subtasks" : "Show subtasks"}
              >
                {showSubtasks ? '▼' : '▶'}
              </button>
            )}
            <button className="delete-btn" onClick={handleDelete}>×</button>
          </div>
        </div>
      </div>

      <div className="subtask-input-container" style={{ display: showSubtaskInput ? undefined : 'none' }}>
          <input
            type="text"
            className="subtask-input"
            placeholder="New subtask..."
            value={subtaskText}
            ref={subtaskInputRef}
            onChange={(e) => setSubtaskText(e.target.value)}
            onKeyDown={handleSubtaskKeyPress}
          />
          <button className="subtask-add-btn" onClick={handleAddSubtask}>Add</button>
          <button
            className="subtask-cancel-btn"
            onClick={() => {
              setSubtaskText('');
              setShowSubtaskInput(false);
            }}
          >
            Cancel
          </button>
      </div>

      {hasSubtasks && showSubtasks && (
        <ul className="subtask-list">
          {subtasks.map(subtask => (
            <li key={subtask.id} className={`subtask-item ${subtask.completed ? 'completed' : ''}`}>
              <div
                className={`subtask-checkbox ${subtask.completed ? 'checked' : ''}`}
                onClick={() => onToggleSubtask(todo.id, subtask.id)}
              />
              <span className="subtask-text">{subtask.text}</span>
              <button
                className="subtask-delete-btn"
                onClick={() => onDeleteSubtask(todo.id, subtask.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default TodoItem;
