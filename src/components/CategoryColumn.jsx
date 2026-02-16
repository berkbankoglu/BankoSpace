import { useState, useRef } from 'react';
import './CategoryColumn.css';
import { playTypeSoundThrottled } from '../utils/sounds';

function CategoryColumn({ title, category, todos, onAddTodo, onToggleTodo, onDeleteTodo, onUpdateTodo, currentFilter, onRename, onAddSubtask, onToggleSubtask, onDeleteSubtask, onReorder, onTodoDragStart, draggingTodo, dragOverCategory, dragOverTodoId }) {
  const [inputValue, setInputValue] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);
  const [expandedTodo, setExpandedTodo] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const inputRef = useRef(null);
  const subtaskInputRef = useRef(null);
  const editInputRef = useRef(null);

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

  const isDragOver = draggingTodo && dragOverCategory === category && draggingTodo.todo.category !== category;

  const sortedTodos = [...todos].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div
      className={`category-column-v2 ${isDragOver ? 'drag-over' : ''}`}
      data-category={category}
    >
      {/* Header */}
      <div className="cc-header">
        {isEditingTitle ? (
          <input
            type="text"
            className="cc-title-input"
            value={editTitleValue}
            onChange={(e) => { playTypeSoundThrottled(); setEditTitleValue(e.target.value); }}
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
      <div className="cc-progress">
        <div className="cc-progress-bar">
          <div className="cc-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="cc-progress-text">{completedCount}/{totalCount}</span>
      </div>

      {/* Add New Task - Top */}
      <div className="cc-add-row">
        <div className="cc-add-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="cc-add-input"
            placeholder="Add task and press Enter..."
            value={inputValue}
            onChange={(e) => { playTypeSoundThrottled(); setInputValue(e.target.value); }}
            onKeyDown={handleKeyPress}
          />
        </div>
      </div>

      {/* Todo Items */}
      <div className="cc-items">
        {sortedTodos.map((todo) => (
          <div
            key={todo.id}
            data-todo-id={todo.id}
            className={`cc-item ${todo.completed ? 'completed' : ''} ${draggingTodo && draggingTodo.todo.id === todo.id ? 'dragging' : ''} ${dragOverTodoId && String(dragOverTodoId) === String(todo.id) ? 'drag-target' : ''}`}
            onMouseDown={(e) => onTodoDragStart(e, todo)}
          >
            <div className="cc-item-main">
              <div className="cc-drag-handle" title="Surukle">⠿</div>
              <label className="cc-label">
                <input
                  type="checkbox"
                  className="cc-checkbox"
                  checked={todo.completed}
                  onChange={() => onToggleTodo(todo.id)}
                />
                <span className="cc-checkmark"></span>
                {editingTodoId === todo.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    className="cc-edit-input"
                    value={editingTodoText}
                    onChange={(e) => { playTypeSoundThrottled(); setEditingTodoText(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editingTodoText.trim()) {
                        onUpdateTodo(todo.id, { text: editingTodoText.trim() });
                        setEditingTodoId(null);
                      } else if (e.key === 'Escape') {
                        setEditingTodoId(null);
                      }
                    }}
                    onBlur={() => {
                      if (editingTodoText.trim() && editingTodoText.trim() !== todo.text) {
                        onUpdateTodo(todo.id, { text: editingTodoText.trim() });
                      }
                      setEditingTodoId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="cc-text">{todo.text}</span>
                )}
              </label>
              <div className="cc-item-actions">
                {todo.subtasks && todo.subtasks.length > 0 && (
                  <span className="cc-subtask-badge">
                    {todo.subtasks.filter(s => s.completed).length}/{todo.subtasks.length}
                  </span>
                )}
                <button
                  className="cc-action-btn edit-btn"
                  onClick={() => {
                    setEditingTodoId(todo.id);
                    setEditingTodoText(todo.text);
                  }}
                  title="Edit"
                >
                  ✎
                </button>
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
                    onChange={(e) => { playTypeSoundThrottled(); setSubtaskInput(e.target.value); }}
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
    </div>
  );
}

export default CategoryColumn;
