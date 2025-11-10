import { useState } from 'react';

function TodoItem({ todo, onToggle, onDelete }) {
  const [isDeleting, setIsDeleting] = useState(false);

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
    <li className={`todo-item ${todo.completed ? 'completed' : ''} ${isDeleting ? 'disintegrating' : ''}`}>
      <div className="todo-top">
        <div 
          className={`checkbox ${todo.completed ? 'checked' : ''}`}
          onClick={handleToggle}
        />
        <div className="todo-content">
          <div className="todo-text">{todo.text}</div>
          <div className="todo-meta">
            <span className="created-date">{formatDate(todo.createdAt)}</span>
            <button className="delete-btn" onClick={handleDelete}>×</button>
          </div>
        </div>
      </div>
    </li>
  );
}

export default TodoItem;
