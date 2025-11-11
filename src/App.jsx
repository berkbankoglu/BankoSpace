import { useState, useEffect } from 'react';
import './App.css';
import CategoryColumn from './components/CategoryColumn';
import ReferencePanel from './components/ReferencePanel';
import Timer from './components/Timer';
import FlashCards from './components/FlashCards';

function App() {
  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('todos');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentFilter, setCurrentFilter] = useState('active');
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'dark';
  });

  // Todo'lar değiştiğinde localStorage'a kaydet
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  // Theme değiştiğinde localStorage'a kaydet ve body'ye class ekle
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.className = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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

  // Export: Tüm verileri JSON dosyası olarak indir
  const exportData = async () => {
    try {
      // localStorage'daki tüm verileri topla
      const data = {
        todos: todos,
        refImages: localStorage.getItem('refImages') || '[]',
        refTexts: localStorage.getItem('refTexts') || '[]',
        flashCards: localStorage.getItem('flashCards') || '[]',
        exportDate: new Date().toISOString(),
        version: '1.0'
      };

      const dataStr = JSON.stringify(data, null, 2);

      // Tauri dialog API'sini kullan
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const date = new Date().toISOString().split('T')[0];
      const filePath = await save({
        defaultPath: `todo-yedek-${date}.json`,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      if (filePath) {
        await writeTextFile(filePath, dataStr);
        alert('Data successfully exported!');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('An error occurred during export.');
    }
  };

  // Import: JSON dosyasından verileri yükle
  const importData = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await open({
        multiple: false,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      if (!filePath) return;

      const fileContent = await readTextFile(filePath);
      const data = JSON.parse(fileContent);

      // Todo'ları yükle
      if (data.todos) {
        setTodos(data.todos);
        localStorage.setItem('todos', JSON.stringify(data.todos));
      }

      // Referans resimlerini yükle
      if (data.refImages) {
        localStorage.setItem('refImages', data.refImages);
      }

      // Referans metinlerini yükle
      if (data.refTexts) {
        localStorage.setItem('refTexts', data.refTexts);
      }

      // FlashCards'ları yükle
      if (data.flashCards) {
        localStorage.setItem('flashCards', data.flashCards);
      }

      alert('Data successfully imported! Page will reload.');
      window.location.reload();
    } catch (error) {
      console.error('Import error:', error);
      alert('File could not be read. Please select a valid backup file.');
    }
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
        <h1>BankoSpace</h1>
        <div className="export-import-buttons">
          <button onClick={toggleTheme} className="theme-toggle-btn" title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={exportData} className="export-btn" title="Export data">
            📥 Export
          </button>
          <button onClick={importData} className="import-btn" title="Import data">
            📤 Import
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat-item">Total: <span>{stats.total}</span></div>
        <div className="stat-item">Active: <span>{stats.active}</span></div>
        <div className="stat-item">Done: <span>{stats.completed}</span></div>
        <Timer />
      </div>

      <div className="filters">
        <button
          className={`filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-btn ${currentFilter === 'active' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('active')}
        >
          Active
        </button>
        <button
          className={`filter-btn ${currentFilter === 'completed' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('completed')}
        >
          Completed
        </button>
      </div>

      <div className="main-layout">
        <CategoryColumn
          title="Daily"
          category="daily"
          todos={todosByCategory.daily}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
        <CategoryColumn
          title="Weekly"
          category="weekly"
          todos={todosByCategory.weekly}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
        <CategoryColumn
          title="Monthly"
          category="monthly"
          todos={todosByCategory.monthly}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
        <CategoryColumn
          title="Long Term"
          category="longterm"
          todos={todosByCategory.longterm}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          currentFilter={currentFilter}
        />
      </div>

      <ReferencePanel />
      <FlashCards />
    </div>
  );
}

export default App;
