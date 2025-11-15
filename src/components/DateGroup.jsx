import { useState } from 'react';

function DateGroup({ dateKey, todos, onToggleTodo }) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Şimdi';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    
    return date.toLocaleDateString('tr-TR', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  return (
    <div className="date-group">
      <div 
        className={`date-group-header ${isCollapsed ? 'collapsed' : ''}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>{dateKey}</span>
        <span>({todos.length})</span>
      </div>
      <div className={`date-group-content ${isCollapsed ? 'collapsed' : ''}`}>
        {todos.map(todo => (
          <div key={todo.id} className="todo-item completed">
            <div className="todo-top">
              <div 
                className="checkbox checked"
                onClick={() => onToggleTodo(todo.id)}
              />
              <div className="todo-content">
                <div className="todo-text">{todo.text}</div>
                <div className="todo-meta">
                  <span className="created-date">{formatDate(todo.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DateGroup;
