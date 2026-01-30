import { useState, useEffect, useRef } from 'react';
import './App.css';
import CategoryColumn from './components/CategoryColumn';
import ReferencePanel from './components/ReferencePanel';
import Timer from './components/Timer';
import FlashCards from './components/FlashCards';
import StudyReminders from './components/StudyReminders';
import DailyChecklist from './components/DailyChecklist';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const APP_VERSION = '3.0.0';

function App() {
  // Check if this is a popup window
  const isPopup = new URLSearchParams(window.location.search).get('popup') === 'reference';

  // If popup mode, just show Reference Panel
  if (isPopup) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#1a1a1a' }}>
        <ReferencePanel />
      </div>
    );
  }

  const [showUpdateWarning, setShowUpdateWarning] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Auto-update check on app start
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        console.log('Checking for updates...');
        const update = await check();

        if (update) {
          console.log(`Update available: ${update.version} (current: ${update.currentVersion})`);
          setUpdateAvailable(update);
        } else {
          console.log('No updates available');
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    // Check for updates when app starts
    checkForUpdates();

    // Check for updates every 10 minutes
    const interval = setInterval(checkForUpdates, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Install update function
  const installUpdate = async () => {
    if (!updateAvailable) return;

    try {
      setIsUpdating(true);
      console.log('Downloading and installing update...');

      await updateAvailable.downloadAndInstall();

      console.log('Update installed, relaunching app...');
      await relaunch();
    } catch (error) {
      console.error('Failed to install update:', error);
      setIsUpdating(false);
      alert('Update failed. Please try again or download manually from GitHub.');
    }
  };

  // Version check - otomatik güncelleme için
  useEffect(() => {
    const savedVersion = localStorage.getItem('appVersion');
    if (savedVersion && savedVersion !== APP_VERSION) {
      console.log(`Version updated from ${savedVersion} to ${APP_VERSION}`);
      // Eski versiyon uyarısı göster
      setShowUpdateWarning(true);
      // Cache'i temizle
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
    }
    localStorage.setItem('appVersion', APP_VERSION);
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' or individual views
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Full sidebar collapsed
  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('todos');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentFilter, setCurrentFilter] = useState('active');
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'dark';
  });

  // Collapse states for sections
  const [todoCollapsed, setTodoCollapsed] = useState(() => {
    const saved = localStorage.getItem('todoCollapsed');
    return saved === 'true';
  });
  const [referencesCollapsed, setReferencesCollapsed] = useState(() => {
    const saved = localStorage.getItem('referencesCollapsed');
    return saved === 'true';
  });
  const [flashCardsCollapsed, setFlashCardsCollapsed] = useState(() => {
    const saved = localStorage.getItem('flashCardsCollapsed');
    return saved === 'true';
  });
  const [remindersCollapsed, setRemindersCollapsed] = useState(() => {
    const saved = localStorage.getItem('remindersCollapsed');
    return saved === 'true';
  });
  const [timerCollapsed, setTimerCollapsed] = useState(() => {
    const saved = localStorage.getItem('timerCollapsed');
    return saved === 'true';
  });
  const [dailyChecklistCollapsed, setDailyChecklistCollapsed] = useState(() => {
    const saved = localStorage.getItem('dailyChecklistCollapsed');
    return saved === 'true';
  });
  const [longtermChecklistCollapsed, setLongtermChecklistCollapsed] = useState(() => {
    const saved = localStorage.getItem('longtermChecklistCollapsed');
    return saved === 'true';
  });


  // Custom category names
  const [categoryNames, setCategoryNames] = useState(() => {
    const saved = localStorage.getItem('categoryNames');
    return saved ? JSON.parse(saved) : {
      daily: 'Daily',
      weekly: 'Weekly',
      longterm: 'Long Term'
    };
  });

  // Checklist names
  const [checklistNames, setChecklistNames] = useState(() => {
    const saved = localStorage.getItem('checklistNames');
    return saved ? JSON.parse(saved) : {
      daily: 'Daily Check List',
      longterm: 'Long-term Checklist'
    };
  });

  const [editingChecklistId, setEditingChecklistId] = useState(null);

  // Streak Tracker State
  const [streakData, setStreakData] = useState(() => {
    const saved = localStorage.getItem('streakData');
    return saved ? JSON.parse(saved) : {
      currentStreak: 0,
      bestStreak: 0,
      lastCompletionDate: null,
      completionDates: [] // Array of timestamps
    };
  });


  // Todo'lar değiştiğinde localStorage'a kaydet
  useEffect(() => {
    console.log('Todos changed, saving to localStorage:', todos.length, 'items');
    const timestamp = new Date().toISOString();
    localStorage.setItem('todos', JSON.stringify(todos));
    localStorage.setItem('lastUpdated', timestamp);
    console.log('localStorage updated at:', timestamp);
  }, [todos]);


  // Theme değiştiğinde localStorage'a kaydet ve body'ye class ekle
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.className = theme;
  }, [theme]);

  // Save collapse states to localStorage
  useEffect(() => {
    localStorage.setItem('todoCollapsed', todoCollapsed);
  }, [todoCollapsed]);

  useEffect(() => {
    localStorage.setItem('referencesCollapsed', referencesCollapsed);
  }, [referencesCollapsed]);

  useEffect(() => {
    localStorage.setItem('flashCardsCollapsed', flashCardsCollapsed);
  }, [flashCardsCollapsed]);

  useEffect(() => {
    localStorage.setItem('remindersCollapsed', remindersCollapsed);
  }, [remindersCollapsed]);

  useEffect(() => {
    localStorage.setItem('timerCollapsed', timerCollapsed);
  }, [timerCollapsed]);

  useEffect(() => {
    localStorage.setItem('dailyChecklistCollapsed', dailyChecklistCollapsed);
  }, [dailyChecklistCollapsed]);

  useEffect(() => {
    localStorage.setItem('longtermChecklistCollapsed', longtermChecklistCollapsed);
  }, [longtermChecklistCollapsed]);

  // Save category names to localStorage
  useEffect(() => {
    localStorage.setItem('categoryNames', JSON.stringify(categoryNames));
  }, [categoryNames]);

  // Save checklist names to localStorage
  useEffect(() => {
    localStorage.setItem('checklistNames', JSON.stringify(checklistNames));
  }, [checklistNames]);

  // Save streak data to localStorage
  useEffect(() => {
    localStorage.setItem('streakData', JSON.stringify(streakData));
  }, [streakData]);

  // Check and update streak on component mount
  useEffect(() => {
    updateStreak();
  }, []);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showSettings && !e.target.closest('.settings-btn') && !e.target.closest('.settings-dropdown')) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);


  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };


  const addTodo = (category, text) => {
    const newTodo = {
      id: Date.now(),
      text,
      category,
      completed: false,
      createdAt: Date.now(),
      subtasks: [],
      order: todos.filter(t => t.category === category).length
    };
    setTodos([newTodo, ...todos]);
  };

  const addSubtask = (todoId, subtaskText) => {
    setTodos(todos.map(todo => {
      if (todo.id === todoId) {
        const newSubtask = {
          id: Date.now(),
          text: subtaskText,
          completed: false
        };
        return {
          ...todo,
          subtasks: [...(todo.subtasks || []), newSubtask]
        };
      }
      return todo;
    }));
  };

  const toggleSubtask = (todoId, subtaskId) => {
    setTodos(todos.map(todo => {
      if (todo.id === todoId) {
        const updatedSubtasks = (todo.subtasks || []).map(st =>
          st.id === subtaskId ? { ...st, completed: !st.completed } : st
        );
        return { ...todo, subtasks: updatedSubtasks };
      }
      return todo;
    }));
  };

  const deleteSubtask = (todoId, subtaskId) => {
    setTodos(todos.map(todo => {
      if (todo.id === todoId) {
        return {
          ...todo,
          subtasks: (todo.subtasks || []).filter(st => st.id !== subtaskId)
        };
      }
      return todo;
    }));
  };

  const reorderTodos = (category, startIndex, endIndex) => {
    console.log('Reorder called:', { category, startIndex, endIndex });

    const categoryTodos = todos.filter(t => t.category === category);
    const otherTodos = todos.filter(t => t.category !== category);

    console.log('Category todos count:', categoryTodos.length);

    // Sınır kontrolü
    if (endIndex < 0 || endIndex >= categoryTodos.length) {
      console.log('Invalid endIndex');
      return;
    }
    if (startIndex < 0 || startIndex >= categoryTodos.length) {
      console.log('Invalid startIndex');
      return;
    }

    const [removed] = categoryTodos.splice(startIndex, 1);
    categoryTodos.splice(endIndex, 0, removed);

    const reorderedCategoryTodos = categoryTodos.map((todo, index) => ({
      ...todo,
      order: index
    }));

    console.log('Reordered successfully');
    setTodos([...reorderedCategoryTodos, ...otherTodos]);
  };

  const toggleTodo = (id) => {
    const updatedTodos = todos.map(todo => {
      if (todo.id === id) {
        const newCompleted = !todo.completed;
        return {
          ...todo,
          completed: newCompleted,
          completedAt: newCompleted ? Date.now() : null
        };
      }
      return todo;
    });
    setTodos(updatedTodos);

    // Check if this completion creates a daily streak
    const toggledTodo = updatedTodos.find(t => t.id === id);
    if (toggledTodo && toggledTodo.completed) {
      updateStreak();
    }
  };

  // Update streak based on daily completions
  const updateStreak = () => {
    const today = new Date().setHours(0, 0, 0, 0);
    const yesterday = today - 24 * 60 * 60 * 1000;

    // Check if any todos were completed today
    const completedToday = todos.some(todo =>
      todo.completed && new Date(todo.createdAt).setHours(0, 0, 0, 0) === today
    );

    if (!completedToday) return;

    const lastDate = streakData.lastCompletionDate;
    const lastDateNormalized = lastDate ? new Date(lastDate).setHours(0, 0, 0, 0) : null;

    // If already counted today, don't update
    if (lastDateNormalized === today) return;

    let newCurrentStreak = streakData.currentStreak;

    // If last completion was yesterday, increment streak
    if (lastDateNormalized === yesterday) {
      newCurrentStreak = streakData.currentStreak + 1;
    }
    // If last completion was today (shouldn't happen but handle it)
    else if (lastDateNormalized === today) {
      return;
    }
    // Otherwise, start new streak
    else {
      newCurrentStreak = 1;
    }

    const newBestStreak = Math.max(newCurrentStreak, streakData.bestStreak);

    setStreakData({
      currentStreak: newCurrentStreak,
      bestStreak: newBestStreak,
      lastCompletionDate: today,
      completionDates: [...streakData.completionDates, today]
    });
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const renameCategory = (category, newName) => {
    setCategoryNames(prev => ({
      ...prev,
      [category]: newName
    }));
  };

  // Search function
  const handleSearch = (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const results = [];
    const lowerQuery = query.toLowerCase();

    // Search in todos
    todos.forEach(todo => {
      if (todo.text.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'todo',
          id: todo.id,
          title: todo.text,
          category: todo.category,
          icon: '📝'
        });
      }
      // Search in subtasks
      if (todo.subtasks) {
        todo.subtasks.forEach(subtask => {
          if (subtask.text.toLowerCase().includes(lowerQuery)) {
            results.push({
              type: 'subtask',
              id: subtask.id,
              parentId: todo.id,
              title: subtask.text,
              parent: todo.text,
              icon: '📋'
            });
          }
        });
      }
    });

    // Search in flash cards
    const flashCards = JSON.parse(localStorage.getItem('flashCards') || '[]');
    flashCards.forEach(card => {
      if (card.front.toLowerCase().includes(lowerQuery) || card.back.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'flashcard',
          id: card.id,
          title: card.front,
          subtitle: card.back,
          group: card.group,
          icon: '🎴'
        });
      }
    });

    // Search in checklists
    const dailyItems = JSON.parse(localStorage.getItem('dailyChecklistItems') || '[]');
    dailyItems.forEach(item => {
      if (item.text.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'checklist',
          id: item.id,
          title: item.text,
          listType: 'daily',
          icon: '✅'
        });
      }
    });

    const longtermItems = JSON.parse(localStorage.getItem('longtermChecklistItems') || '[]');
    longtermItems.forEach(item => {
      if (item.text.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'checklist',
          id: item.id,
          title: item.text,
          listType: 'longterm',
          icon: '📌'
        });
      }
    });

    setSearchResults(results.slice(0, 10)); // Limit to 10 results
  };

  const handleSearchResultClick = (result) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    if (result.type === 'todo' || result.type === 'subtask') {
      setActiveView('dashboard');
      // Highlight the todo item briefly
      setTimeout(() => {
        const element = document.querySelector(`[data-todo-id="${result.type === 'subtask' ? result.parentId : result.id}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-search');
          setTimeout(() => element.classList.remove('highlight-search'), 2000);
        }
      }, 100);
    } else if (result.type === 'flashcard') {
      setActiveView('flashcards');
    } else if (result.type === 'checklist') {
      setActiveView('checklists');
    }
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
        flashCardGroups: localStorage.getItem('flashCardGroups') || '[]',
        goals: localStorage.getItem('goals') || '[]',
        studyReminders: localStorage.getItem('studyReminders') || '[]',
        streakData: localStorage.getItem('streakData') || '{}',
        exportDate: new Date().toISOString(),
        version: '4.2'
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

      // FlashCard gruplarını yükle
      if (data.flashCardGroups) {
        localStorage.setItem('flashCardGroups', data.flashCardGroups);
      }

      // Streak verisini yükle
      if (data.streakData) {
        localStorage.setItem('streakData', data.streakData);
      }

      // Goals'ı yükle
      if (data.goals) {
        localStorage.setItem('goals', data.goals);
      }

      // Study Reminders'ı yükle
      if (data.studyReminders) {
        localStorage.setItem('studyReminders', data.studyReminders);
      }

      alert('Data successfully imported! Page will reload.');
      window.location.reload();
    } catch (error) {
      console.error('Import error:', error);
      alert('File could not be read. Please select a valid backup file.');
    }
  };

  // Reset: Delete all data
  const resetAllData = () => {
    const warning1 = window.prompt('⚠️ WARNING: This will DELETE ALL your data!\n\n' +
      'The following will be deleted:\n' +
      '• All your todo lists\n' +
      '• References and notes\n' +
      '• Flash cards\n' +
      '• Goals and reminders\n' +
      '• Timer settings\n' +
      '• Achievements and heatmap\n\n' +
      'Type "YES" to continue:');

    if (warning1 !== 'YES') {
      alert('Cancelled.');
      return;
    }

    const warning2 = window.prompt('⚠️ FINAL WARNING: This action CANNOT be undone!\n\n' +
      'All your data will be PERMANENTLY deleted.\n' +
      'Your Firebase data will also be deleted.\n\n' +
      'Type "RESET" to confirm:');

    if (warning2 !== 'RESET') {
      alert('Cancelled.');
      return;
    }

    // Clear all localStorage data (except theme)
    const currentTheme = localStorage.getItem('theme');
    localStorage.clear();
    if (currentTheme) {
      localStorage.setItem('theme', currentTheme);
    }

    // Reset states
    setTodos([]);

    alert('✅ All data successfully deleted! Page will reload.');
    window.location.reload();
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


  return (
    <div className="container">

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <div className="settings-options">
              <button onClick={() => { exportData(); setShowSettings(false); }} className="settings-btn-large">
                📥 Export Data
              </button>
              <button onClick={() => { importData(); setShowSettings(false); }} className="settings-btn-large">
                📤 Import Data
              </button>
              <button onClick={() => { resetAllData(); setShowSettings(false); }} className="settings-btn-large danger">
                🗑️ Reset All Data
              </button>
            </div>
            <div className="modal-footer">
              <span className="version-info">BankoSpace v{APP_VERSION}</span>
              <button onClick={() => setShowSettings(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-update notification modal */}
      {updateAvailable && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Update Available</h2>
            <p>A new version ({updateAvailable.version}) is available.</p>
            <p>Current version: {updateAvailable.currentVersion}</p>
            <div className="modal-buttons">
              <button
                onClick={installUpdate}
                disabled={isUpdating}
                className="btn-primary"
              >
                {isUpdating ? 'Installing...' : 'Install Update'}
              </button>
              <button
                onClick={() => setUpdateAvailable(null)}
                disabled={isUpdating}
                className="btn-secondary"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="content-wrapper">
        {/* Left Sidebar - Notion Style */}
        <div className={`notion-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Sidebar Header */}
          <div className="sidebar-header">
            <div className="sidebar-title">
              <span className="sidebar-icon">🏠</span>
              {!sidebarCollapsed && <span>BankoSpace</span>}
            </div>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="sidebar-content">
              {/* Search */}
              <div className="sidebar-search">
                <div className="search-input-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => setShowSearch(true)}
                  />
                  {searchQuery && (
                    <button
                      className="search-clear"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {showSearch && searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map((result, index) => (
                      <div
                        key={`${result.type}-${result.id}-${index}`}
                        className="search-result-item"
                        onClick={() => handleSearchResultClick(result)}
                      >
                        <span className="result-icon">{result.icon}</span>
                        <div className="result-content">
                          <span className="result-title">{result.title}</span>
                          {result.subtitle && (
                            <span className="result-subtitle">{result.subtitle}</span>
                          )}
                          {result.category && (
                            <span className="result-badge">{result.category}</span>
                          )}
                          {result.group && (
                            <span className="result-badge">{result.group}</span>
                          )}
                          {result.listType && (
                            <span className="result-badge">{result.listType}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showSearch && searchQuery && searchResults.length === 0 && (
                  <div className="search-results">
                    <div className="search-no-results">No results found</div>
                  </div>
                )}
              </div>

              {/* Dashboard - Main Page */}
              <div
                className={`sidebar-item main-item ${activeView === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveView('dashboard')}
              >
                <span className="item-icon">☑️</span>
                <span className="item-name">Dashboard</span>
              </div>

              {/* References - Separate Page */}
              <div
                className={`sidebar-item ${activeView === 'references' ? 'active' : ''}`}
                onClick={() => setActiveView('references')}
              >
                <span className="item-icon">📚</span>
                <span className="item-name">References</span>
              </div>

              {/* Flash Cards */}
              <div
                className={`sidebar-item ${activeView === 'flashcards' ? 'active' : ''}`}
                onClick={() => setActiveView('flashcards')}
              >
                <span className="item-icon">🎴</span>
                <span className="item-name">Flash Cards</span>
              </div>

              {/* Checklists */}
              <div
                className={`sidebar-item ${activeView === 'checklists' ? 'active' : ''}`}
                onClick={() => setActiveView('checklists')}
              >
                <span className="item-icon">✅</span>
                <span className="item-name">Checklists</span>
              </div>

              {/* Settings at bottom */}
              <div className="sidebar-bottom">
                <div
                  className="sidebar-item"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <span className="item-icon">⚙️</span>
                  <span className="item-name">Settings</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="main-content-area">
          {/* References Full Screen View */}
          {activeView === 'references' && (
            <div className="references-fullscreen">
              <ReferencePanel />
            </div>
          )}

          {/* Flash Cards Full Screen View */}
          {activeView === 'flashcards' && (
            <div className="flashcards-fullscreen">
              <FlashCards fullscreen={true} />
            </div>
          )}

          {/* Checklists Full Screen View */}
          {activeView === 'checklists' && (
            <div className="checklists-fullscreen">
              <div className="checklists-container">
                <div className="checklist-section">
                  <h2>{checklistNames.daily}</h2>
                  <DailyChecklist />
                </div>
                <div className="checklist-section">
                  <h2>{checklistNames.longterm}</h2>
                  <DailyChecklist storageKey="longtermChecklist" />
                </div>
                <div className="checklist-section">
                  <h2>Study Reminders</h2>
                  <StudyReminders />
                </div>
              </div>
            </div>
          )}

          {/* Dashboard View */}
          {activeView === 'dashboard' && (
          <div className="dashboard-container">
            {/* Dashboard Header */}
            <div className="dashboard-header">
              <h1 className="dashboard-title">☑️ Dashboard</h1>
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
            </div>

            {/* Main Layout - Left: Todos, Right: Tools */}
            <div className="dashboard-layout">
              {/* Left Side - Todo Lists */}
              <div className="dashboard-left">
                {/* To-Do Lists Section */}
                <div className="app-section">
                  <div
                    className="section-unified-header"
                    onClick={() => setTodoCollapsed(!todoCollapsed)}
                  >
                    <div className="section-header-left">
                      <h2>To-Do Lists</h2>
                      <span className="collapse-indicator">{todoCollapsed ? '▼' : '▲'}</span>
                    </div>
                  </div>
                  <div className={`section-content ${todoCollapsed ? 'collapsed' : ''}`}>
                    <div className="todo-columns">
                      <CategoryColumn
                        title={categoryNames.daily}
                        category="daily"
                        todos={todosByCategory.daily}
                        onAddTodo={addTodo}
                        onToggleTodo={toggleTodo}
                        onDeleteTodo={deleteTodo}
                        onRename={renameCategory}
                        currentFilter={currentFilter}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        onDeleteSubtask={deleteSubtask}
                        onReorder={reorderTodos}
                      />
                      <CategoryColumn
                        title={categoryNames.weekly}
                        category="weekly"
                        todos={todosByCategory.weekly}
                        onAddTodo={addTodo}
                        onToggleTodo={toggleTodo}
                        onDeleteTodo={deleteTodo}
                        onRename={renameCategory}
                        currentFilter={currentFilter}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        onDeleteSubtask={deleteSubtask}
                        onReorder={reorderTodos}
                      />
                      <CategoryColumn
                        title={categoryNames.longterm}
                        category="longterm"
                        todos={todosByCategory.longterm}
                        onAddTodo={addTodo}
                        onToggleTodo={toggleTodo}
                        onDeleteTodo={deleteTodo}
                        onRename={renameCategory}
                        currentFilter={currentFilter}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        onDeleteSubtask={deleteSubtask}
                        onReorder={reorderTodos}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Tools */}
              <div className="dashboard-right">
                {/* Timer */}
                <div className="app-section sidebar-section">
                  <div
                    className="section-unified-header"
                    onClick={() => setTimerCollapsed(!timerCollapsed)}
                  >
                    <div className="section-header-left">
                      <h2>Timer</h2>
                      <span className="collapse-indicator">{timerCollapsed ? '▼' : '▲'}</span>
                    </div>
                  </div>
                  <div className={`section-content ${timerCollapsed ? 'collapsed' : ''}`}>
                    <Timer />
                  </div>
                </div>

              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
