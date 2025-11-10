import { useState, useEffect } from 'react';
import './App.css';
import CategoryColumn from './components/CategoryColumn';
import ReferencePanel from './components/ReferencePanel';

function App() {
  const [todos, setTodos] = useState([]);
  const [currentFilter, setCurrentFilter] = useState('active');

  useEffect(() => {
    const saved = localStorage.getItem('todos');
    if (saved) {
      setTodos(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  const addTodo = (category, text) => {
    const newTodo = {
      id: Date.now(),
      text,
      category,
      completed: false,
      createdAt: Date.now()
    };
    setTodos([newTodo, ...todos]);
  };

  const toggleTodo = (id) => {
    setTodos(todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const filteredTodos = todos.filter(todo => {
    if (currentFilter === 'active') return !todo.completed;
    if (currentFilter === 'completed') return todo.completed;
    return true;
  });

  const todosByCategory = {
    daily: filteredTodos.filter(t => t.category === 'daily'),
    weekly: filteredTodos.filter(t => t.category === 'weekly'),
    monthly: filteredTodos.filter(t => t.category === 'monthly'),
    longterm: filteredTodos.filter(t => t.category === 'longterm')
  };

  const stats = {
    total: todos.length,
    active: todos.filter(t => !t.completed).length,
    completed: todos.filter(t => t.completed).length
  };

  return (
    <div className="container">
      <div className="header-row">
        <h1>To-Do</h1>
      </div>

      <div className="stats">
        <div className="stat-item">Toplam: <span>{stats.total}</span></div>
        <div className="stat-item">Aktif: <span>{stats.active}</span></div>
        <div className="stat-item">Bitti: <span>{stats.completed}</span></div>
      </div>

      <div className="filters">
        <button 
          className={`filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('all')}
        >
          Tümü
        </button>
        <button 
          className={`filter-btn ${currentFilter === 'active' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('active')}
        >
          Aktif
        </button>
        <button 
          className={`filter-btn ${currentFilter === 'completed' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('completed')}
        >
          Tamamlanan
        </button>
      </div>

      <div className="main-layout">
        <CategoryColumn
          title="Günlük"
          category="daily"
          todos={todosByCategory.daily}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
        <CategoryColumn
          title="Haftalık"
          category="weekly"
          todos={todosByCategory.weekly}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
        <CategoryColumn
          title="Aylık"
          category="monthly"
          todos={todosByCategory.monthly}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
        <CategoryColumn
          title="Geniş Zaman"
          category="longterm"
          todos={todosByCategory.longterm}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
      </div>

      <ReferencePanel />
    </div>
  );
}

export default App;
