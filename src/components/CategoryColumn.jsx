import { useState, useEffect, useRef } from 'react';
import './CategoryColumn.css';
import { playTypeSoundThrottled } from '../utils/sounds';

function CategoryColumn({ title, category, todos, onAddTodo, onToggleTodo, onDeleteTodo, onUpdateTodo, currentFilter, onRename, onAddSubtask, onToggleSubtask, onDeleteSubtask, onUpdateSubtask, onReorder, onTodoDragStart, draggingTodo, dragOverCategory, dragOverTodoId }) {
  const [inputValue, setInputValue] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);
  const [expandedTodos, setExpandedTodos] = useState(() => {
    // Start with all todos that have subtasks expanded
    const s = new Set();
    todos.forEach(t => { if (t.subtasks && t.subtasks.length > 0) s.add(t.id); });
    return s;
  });
  const [subtaskInputs, setSubtaskInputs] = useState({});
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [draggingSubtask, setDraggingSubtask] = useState(null); // { todoId, subtaskId, index }
  const [dragOverSubtask, setDragOverSubtask] = useState(null); // { todoId, index }
  const [pressedSubtaskId, setPressedSubtaskId] = useState(null);
  const inputRef = useRef(null);
  const editInputRef = useRef(null);
  const editSubtaskInputRef = useRef(null);

  // Auto-expand todos that have subtasks
  useEffect(() => {
    setExpandedTodos(prev => {
      let changed = false;
      const next = new Set(prev);
      todos.forEach(t => {
        if (t.subtasks && t.subtasks.length > 0 && !next.has(t.id)) {
          next.add(t.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [todos]);

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
    setExpandedTodos(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
    setSubtaskInputs(prev => ({ ...prev, [todoId]: '' }));
  };

  const handleAddSubtask = (todoId) => {
    const val = subtaskInputs[todoId] || '';
    if (val.trim()) {
      onAddSubtask(todoId, val.trim());
      setSubtaskInputs(prev => ({ ...prev, [todoId]: '' }));
    }
  };

  const subtaskDragRef = useRef(null);
  const subtaskDragOverRef = useRef(null);

  const handleSubtaskMouseDown = (e, todoId, subtaskId, index) => {
    e.preventDefault();
    e.stopPropagation();
    setPressedSubtaskId(subtaskId);
    subtaskDragRef.current = { todoId, subtaskId, index, started: false };

    const onMouseMove = (me) => {
      if (!subtaskDragRef.current) return;
      if (!subtaskDragRef.current.started) {
        subtaskDragRef.current.started = true;
        setDraggingSubtask({ todoId, subtaskId, index });
      }
      const els = document.querySelectorAll(`.cc-subtask[data-subtask-todoid="${todoId}"]`);
      let overIdx = null;
      els.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (me.clientY >= rect.top && me.clientY <= rect.bottom) overIdx = i;
      });
      if (overIdx !== null) {
        subtaskDragOverRef.current = overIdx;
        setDragOverSubtask({ todoId, index: overIdx });
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!subtaskDragRef.current?.started) { subtaskDragRef.current = null; return; }
      const { todoId: tid, index: fromIdx } = subtaskDragRef.current;
      const toIdx = subtaskDragOverRef.current;
      subtaskDragRef.current = null;
      subtaskDragOverRef.current = null;
      setDraggingSubtask(null);
      setDragOverSubtask(null);
      setPressedSubtaskId(null);
      if (toIdx !== null && toIdx !== undefined && toIdx !== fromIdx) {
        const todo = todos.find(t => t.id === tid);
        if (!todo) return;
        const subtasks = [...(todo.subtasks || [])];
        const [moved] = subtasks.splice(fromIdx, 1);
        subtasks.splice(toIdx, 0, moved);
        onUpdateTodo(tid, { subtasks });
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const isDragOver = draggingTodo && dragOverCategory === category && draggingTodo.todo.category !== category;

  const sortedTodos = [...todos].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

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
          >
            {/* Top row: drag handle + checkbox + actions */}
            <div className="cc-item-top">
              <div className="cc-drag-handle" title="Surukle" onMouseDown={(e) => onTodoDragStart(e, todo)}>⠿</div>
              <label className="cc-inline-check" onClick={e => e.stopPropagation()}>
                <input type="checkbox" className="cc-checkbox" checked={todo.completed} onChange={() => onToggleTodo(todo.id)} />
                <span className="cc-checkmark"></span>
              </label>
              <div className="cc-item-actions">
                {todo.subtasks && todo.subtasks.length > 0 && (
                  <span className="cc-subtask-badge">
                    {todo.subtasks.filter(s => s.completed).length}/{todo.subtasks.length}
                  </span>
                )}
                <button
                  className="cc-action-btn edit-btn"
                  onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text); }}
                  title="Edit"
                >✎</button>
                <button
                  className="cc-action-btn expand"
                  onClick={() => toggleExpand(todo.id)}
                  title="Subtasks"
                >{expandedTodos.has(todo.id) ? '−' : '+'}</button>
                <button
                  className="cc-action-btn delete"
                  onClick={() => onDeleteTodo(todo.id)}
                  title="Delete"
                >×</button>
              </div>
            </div>
            {/* Bottom row: text */}
            <label className="cc-label">
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

            {/* Subtasks */}
            {expandedTodos.has(todo.id) && (
              <div className="cc-subtasks">
                {todo.subtasks && todo.subtasks.map((subtask, sIdx) => (
                  <div
                    key={subtask.id}
                    data-subtask-todoid={todo.id}
                    className={`cc-subtask ${subtask.completed ? 'completed' : ''} ${draggingSubtask?.subtaskId === subtask.id ? 'dragging' : ''} ${pressedSubtaskId === subtask.id && !draggingSubtask ? 'pressed' : ''} ${dragOverSubtask && dragOverSubtask.todoId === todo.id && dragOverSubtask.index === sIdx && draggingSubtask?.subtaskId !== subtask.id ? 'drag-target' : ''}`}
                  >
                    <span
                      className="cc-drag-handle cc-subtask-drag"
                      onMouseDown={(e) => handleSubtaskMouseDown(e, todo.id, subtask.id, sIdx)}
                    >⠿</span>
                    <label className="cc-label" onClick={(e) => { if (editingSubtaskId === subtask.id) e.preventDefault(); }}>
                      <input
                        type="checkbox"
                        className="cc-checkbox small"
                        checked={subtask.completed}
                        onChange={() => onToggleSubtask(todo.id, subtask.id)}
                      />
                      <span className="cc-checkmark small"></span>
                      {editingSubtaskId === subtask.id ? (
                        <input
                          ref={editSubtaskInputRef}
                          type="text"
                          className="cc-edit-input"
                          value={editingSubtaskText}
                          onChange={(e) => { playTypeSoundThrottled(); setEditingSubtaskText(e.target.value); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editingSubtaskText.trim()) {
                              onUpdateSubtask && onUpdateSubtask(todo.id, subtask.id, editingSubtaskText.trim());
                              setEditingSubtaskId(null);
                            } else if (e.key === 'Escape') {
                              setEditingSubtaskId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingSubtaskText.trim() && editingSubtaskText.trim() !== subtask.text) {
                              onUpdateSubtask && onUpdateSubtask(todo.id, subtask.id, editingSubtaskText.trim());
                            }
                            setEditingSubtaskId(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="cc-text">{subtask.text}</span>
                      )}
                    </label>
                    <div className="cc-subtask-actions">
                      <button
                        className="cc-action-btn edit-btn small"
                        onClick={(e) => { e.stopPropagation(); setEditingSubtaskId(subtask.id); setEditingSubtaskText(subtask.text); }}
                        title="Edit"
                      >✎</button>
                      <button
                        className="cc-action-btn delete small"
                        onClick={() => onDeleteSubtask(todo.id, subtask.id)}
                      >×</button>
                    </div>
                  </div>
                ))}
                <div className="cc-subtask-add">
                  <input
                    type="text"
                    className="cc-subtask-input"
                    placeholder="Add subtask..."
                    value={subtaskInputs[todo.id] || ''}
                    onChange={(e) => { playTypeSoundThrottled(); setSubtaskInputs(prev => ({ ...prev, [todo.id]: e.target.value })); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (subtaskInputs[todo.id] || '').trim()) {
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
