import { useState, useEffect } from 'react';
import './App.css';
import CategoryColumn from './components/CategoryColumn';
import ReferencePanel from './components/ReferencePanel';
import Timer from './components/Timer';

function App() {
  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('todos');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentFilter, setCurrentFilter] = useState('active');

  // Todo'lar değiştiğinde localStorage'a kaydet
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

  // Export: Tüm verileri JSON dosyası olarak indir
  const exportData = async () => {
    try {
      // localStorage'daki tüm verileri topla
      const data = {
        todos: todos,
        refImages: localStorage.getItem('refImages') || '[]',
        refTexts: localStorage.getItem('refTexts') || '[]',
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
        alert('Veriler başarıyla dışa aktarıldı!');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Dışa aktarma sırasında bir hata oluştu.');
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

      alert('Veriler başarıyla içe aktarıldı! Sayfa yenilenecek.');
      window.location.reload();
    } catch (error) {
      console.error('Import error:', error);
      alert('Dosya okunamadı. Lütfen geçerli bir yedek dosyası seçin.');
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
        <h1>To-Do</h1>
        <div className="export-import-buttons">
          <button onClick={exportData} className="export-btn" title="Verileri dışa aktar">
            📥 Dışa Aktar
          </button>
          <button onClick={importData} className="import-btn" title="Verileri içe aktar">
            📤 İçe Aktar
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat-item">Toplam: <span>{stats.total}</span></div>
        <div className="stat-item">Aktif: <span>{stats.active}</span></div>
        <div className="stat-item">Bitti: <span>{stats.completed}</span></div>
        <Timer />
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
