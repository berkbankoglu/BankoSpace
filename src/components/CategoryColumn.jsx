import { useState } from 'react';
import TodoItem from './TodoItem';
import DateGroup from './DateGroup';

function CategoryColumn({ title, category, todos, onAddTodo, onToggleTodo, onDeleteTodo, currentFilter }) {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const activeCount = todos.filter(t => !t.completed).length;

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
        {title}
        <span className="category-count">{activeCount}</span>
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
            todos.map(todo => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={onToggleTodo}
                onDelete={onDeleteTodo}
              />
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default CategoryColumn;
