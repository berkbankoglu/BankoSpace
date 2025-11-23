import { useState } from 'react';
import TodoItem from './TodoItem';
import DateGroup from './DateGroup';

function CategoryColumn({ title, category, todos, onAddTodo, onToggleTodo, onDeleteTodo, currentFilter, onRename, onAddSubtask, onToggleSubtask, onDeleteSubtask, onReorder }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);

  const activeCount = todos.filter(t => !t.completed).length;
  const completedCount = todos.filter(t => t.completed).length;
  const totalCount = todos.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAddTodo(category, inputValue.trim());
      setInputValue('');
      setShowInput(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setShowInput(false);
      setInputValue('');
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

  const handleTitleCancel = () => {
    setEditTitleValue(title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  };

  // Group by date for completed filter
  const groupedByDate = {};
  if (currentFilter === 'completed') {
    todos.forEach(todo => {
      const dateKey = getDateKey(todo.createdAt);
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      groupedByDate[dateKey].push(todo);
    });
  }

  function getDateKey(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });

    if (date.toDateString() === today.toDateString()) {
      return `Today - ${dateStr}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday - ${dateStr}`;
    } else {
      return dateStr;
    }
  }

  return (
    <div className="category-column">
      <button className="new-task-btn" onClick={() => setShowInput(true)}>
        + Create New Task
      </button>

      {showInput && (
        <div className="task-input-area">
          <input
            type="text"
            className="task-input"
            placeholder="Write task..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            autoFocus
          />
          <div className="input-actions">
            <button className="save-btn" onClick={handleAdd}>Save</button>
            <button className="cancel-btn" onClick={() => { setShowInput(false); setInputValue(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="category-title">
        {isEditingTitle ? (
          <div className="title-edit-container">
            <input
              type="text"
              className="title-edit-input"
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onKeyDown={handleTitleKeyPress}
              onBlur={handleTitleSave}
              autoFocus
            />
          </div>
        ) : (
          <>
            <span onDoubleClick={handleTitleDoubleClick} className="editable-title">
              {title}
            </span>
            <span className="category-count">{activeCount}</span>
          </>
        )}
      </div>

      <div className="category-progress">
        <div className="category-progress-bar">
          <div
            className="category-progress-fill"
            style={{ width: `${completionPercentage}%` }}
          ></div>
        </div>
        <div className="category-progress-text">
          {completedCount}/{totalCount} ({completionPercentage}%)
        </div>
      </div>

      {currentFilter === 'completed' ? (
        <div>
          {Object.keys(groupedByDate).length === 0 ? (
            <div className="empty-state">No tasks</div>
          ) : (
            Object.keys(groupedByDate).sort().reverse().map(dateKey => (
              <DateGroup
                key={dateKey}
                dateKey={dateKey}
                todos={groupedByDate[dateKey]}
                onToggleTodo={onToggleTodo}
              />
            ))
          )}
        </div>
      ) : (
        <ul className="todo-list">
          {todos.length === 0 ? (
            <div className="empty-state">No tasks</div>
          ) : (
            todos
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((todo, index) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                index={index}
                onToggle={onToggleTodo}
                onDelete={onDeleteTodo}
                onAddSubtask={onAddSubtask}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
                draggable={true}
                onDragStart={() => setDraggedIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedIndex !== null && draggedIndex !== index) {
                    onReorder(category, draggedIndex, index);
                  }
                  setDraggedIndex(null);
                }}
                onDragEnd={() => setDraggedIndex(null)}
                isDragging={draggedIndex === index}
                onMoveUp={(idx) => onReorder(category, idx, idx - 1)}
                onMoveDown={(idx) => onReorder(category, idx, idx + 1)}
                isFirst={index === 0}
                isLast={index === todos.length - 1}
              />
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default CategoryColumn;
