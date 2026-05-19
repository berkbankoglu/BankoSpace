import { useState, useEffect, useRef } from 'react';
import './CategoryColumn.css';
import { playTypeSoundThrottled, playCompleteSound, playUncompleteSound, playDeleteSound } from '../utils/sounds';

const TODO_COLORS = ['#667eea', '#f093fb', '#4ade80', '#60a5fa', '#fb923c', '#f87171', '#facc15', '#9ca3af'];

function CategoryColumn({ title, category, todos, onAddTodo, onToggleTodo, onDeleteTodo, onUpdateTodo, currentFilter, onRename, onAddSubtask, onToggleSubtask, onDeleteSubtask, onUpdateSubtask, onReorder, onTodoDragStart }) {
  const [inputValue, setInputValue] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);
  const manuallyClosedRef = useRef(null);
  if (!manuallyClosedRef.current) {
    try { manuallyClosedRef.current = new Set(JSON.parse(localStorage.getItem(`cc_closed_${category}`) || '[]')); }
    catch { manuallyClosedRef.current = new Set(); }
  }
  const [expandedTodos, setExpandedTodos] = useState(() => {
    const closed = manuallyClosedRef.current;
    const s = new Set();
    todos.forEach(t => { if (t.subtasks && t.subtasks.length > 0 && !closed.has(t.id)) s.add(t.id); });
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
  const [completingIds, setCompletingIds] = useState(new Set());
  const [colorPickerTodoId, setColorPickerTodoId] = useState(null);
  const [copiedSubtaskId, setCopiedSubtaskId] = useState(null);
  const inputRef = useRef(null);
  const editInputRef = useRef(null);
  const editSubtaskInputRef = useRef(null);

  // Auto-expand only newly added todos that have subtasks (skip manually closed ones)
  useEffect(() => {
    setExpandedTodos(prev => {
      let changed = false;
      const next = new Set(prev);
      todos.forEach(t => {
        if (t.subtasks && t.subtasks.length > 0 && !next.has(t.id) && !manuallyClosedRef.current.has(t.id)) {
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
    const isOpening = !expandedTodos.has(todoId);
    setExpandedTodos(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
    if (isOpening) manuallyClosedRef.current.delete(todoId);
    else manuallyClosedRef.current.add(todoId);
    localStorage.setItem(`cc_closed_${category}`, JSON.stringify([...manuallyClosedRef.current]));
    setSubtaskInputs(prev => ({ ...prev, [todoId]: '' }));
    if (isOpening) {
      setTimeout(() => {
        const el = document.querySelector(`[data-todo-id="${todoId}"] .cc-subtask-input`);
        if (el) el.focus();
      }, 0);
    }
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

  const isDragOver = false; // DOM class ile yönetiliyor (cc-drag-over)

  const sortedTodos = [...todos].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

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
          <div className="cc-title-wrapper">
            <span className={`cc-priority-badge cc-priority-badge--${category}`}></span>
            <h3 className="cc-title" onDoubleClick={handleTitleDoubleClick}>
              {title}
            </h3>
          </div>
        )}
        <span className="cc-count">{activeCount}</span>
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
        {sortedTodos.map((todo, idx) => (
          <div
            key={todo.id}
            data-todo-id={todo.id}
            className={`cc-item ${todo.completed ? 'completed' : ''} ${completingIds.has(todo.id) ? 'completing' : ''}`}
            style={{ animationDelay: `${idx * 0.22}s` }}
            onClick={() => { if (todo.subtasks && todo.subtasks.length > 0) toggleExpand(todo.id); }}
          >
            {todo.color && <div className="cc-item-color-bar" style={{ background: todo.color }} />}
            {/* Top row: drag handle + checkbox + actions */}
            <div className="cc-item-top">
              <div className="cc-drag-handle" title="Surukle" onMouseDown={(e) => onTodoDragStart(e, todo)}>⠿</div>
              <label className="cc-inline-check" onClick={e => e.stopPropagation()}>
                <input type="checkbox" className="cc-checkbox" checked={todo.completed} onChange={() => {
                  if (!todo.completed) {
                    setCompletingIds(prev => new Set(prev).add(todo.id));
                    setTimeout(() => {
                      onToggleTodo(todo.id);
                      setCompletingIds(prev => { const n = new Set(prev); n.delete(todo.id); return n; });
                    }, 400);
                  } else {
                    onToggleTodo(todo.id);
                  }
                }} />
                <span className="cc-checkmark"></span>
              </label>
              <div className="cc-item-actions">
                {todo.subtasks && todo.subtasks.length > 0 && (
                  <span className="cc-subtask-badge">
                    {todo.subtasks.filter(s => s.completed).length}/{todo.subtasks.length}
                  </span>
                )}
                <button
                  className="cc-action-btn color-btn"
                  onClick={(e) => { e.stopPropagation(); setColorPickerTodoId(colorPickerTodoId === todo.id ? null : todo.id); }}
                  title="Renk"
                  style={{ color: todo.color || '#333' }}
                >●</button>
                {colorPickerTodoId === todo.id && (
                  <div className="cc-color-picker" onClick={e => e.stopPropagation()}>
                    {TODO_COLORS.map(c => (
                      <button
                        key={c}
                        className="cc-color-swatch"
                        style={{ background: c, outline: todo.color === c ? '2px solid white' : 'none' }}
                        onClick={() => { onUpdateTodo(todo.id, { color: todo.color === c ? null : c }); setColorPickerTodoId(null); }}
                      />
                    ))}
                  </div>
                )}
                <button
                  className="cc-action-btn edit-btn"
                  onClick={(e) => { e.stopPropagation(); setEditingTodoId(todo.id); setEditingTodoText(todo.text); }}
                  title="Edit"
                >✎</button>
                <button
                  className="cc-action-btn expand"
                  onClick={(e) => { e.stopPropagation(); toggleExpand(todo.id); }}
                  title="Subtasks"
                >{expandedTodos.has(todo.id) ? '−' : '+'}</button>
                <button
                  className="cc-action-btn delete"
                  onClick={(e) => { e.stopPropagation(); playDeleteSound(); onDeleteTodo(todo.id); }}
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
                <>
                  <span className="cc-text" onDoubleClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text); }}>{todo.text}</span>
                  {todo.subtasks && todo.subtasks.length > 0 && !expandedTodos.has(todo.id) && (
                    <span className="cc-subtask-count-hint">+{todo.subtasks.length}</span>
                  )}
                </>
              )}
            </label>

            {/* Subtasks */}
            <div className={`cc-subtasks-wrapper${expandedTodos.has(todo.id) ? ' expanded' : ''}`}>
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
                        onChange={() => { subtask.completed ? playUncompleteSound() : playCompleteSound(); onToggleSubtask(todo.id, subtask.id); }}
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
                        className="cc-action-btn copy-btn small"
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(subtask.text); setCopiedSubtaskId(subtask.id); setTimeout(() => setCopiedSubtaskId(null), 1500); }}
                        title="Copy"
                      >{copiedSubtaskId === subtask.id ? '✓' : '❐'}</button>
                      <button
                        className="cc-action-btn edit-btn small"
                        onClick={(e) => { e.stopPropagation(); setEditingSubtaskId(subtask.id); setEditingSubtaskText(subtask.text); }}
                        title="Edit"
                      >✎</button>
                      <button
                        className="cc-action-btn delete small"
                        onClick={() => { playDeleteSound(); onDeleteSubtask(todo.id, subtask.id); }}
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
            </div>
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
