import { useState, useEffect, useCallback } from 'react';
import './App.css';
import CategoryColumn from './components/CategoryColumn';
import ReferencePanel from './components/ReferencePanel';
import Timer from './components/Timer';
import FlashCards from './components/FlashCards';
import Goals from './components/Goals';
import StudyReminders from './components/StudyReminders';
import DailyChecklist from './components/DailyChecklist';
import Achievements from './components/Achievements';
import ProductivityHeatmap from './components/ProductivityHeatmap';
import Auth from './components/Auth';
import { FirebaseSync, syncLocalStorageToFirebase, syncFirebaseToLocalStorage } from './services/firebaseSync';

function App() {
  const [user, setUser] = useState(null);
  const [firebaseSync, setFirebaseSync] = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline'); // 'offline', 'syncing', 'synced'
  const [showSettings, setShowSettings] = useState(false);
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
  const [goalsCollapsed, setGoalsCollapsed] = useState(() => {
    const saved = localStorage.getItem('goalsCollapsed');
    return saved === 'true';
  });
  const [remindersCollapsed, setRemindersCollapsed] = useState(() => {
    const saved = localStorage.getItem('remindersCollapsed');
    return saved === 'true';
  });
  const [achievementsCollapsed, setAchievementsCollapsed] = useState(() => {
    const saved = localStorage.getItem('achievementsCollapsed');
    return saved === 'true';
  });
  const [heatmapCollapsed, setHeatmapCollapsed] = useState(() => {
    const saved = localStorage.getItem('heatmapCollapsed');
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

  // Section order for vertical layout (achievements and goals are in sidebars)
  const [sectionOrder] = useState(['todos', 'references', 'flashcards']);

  // Todo'lar değiştiğinde localStorage ve Firebase'e kaydet
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));

    // Firebase'e de kaydet (only for real users, not offline mode)
    // Debounce: Wait 1.5 seconds before syncing to avoid continuous "syncing..." text
    if (firebaseSync && user && user.uid !== 'offline-user') {
      const timer = setTimeout(async () => {
        try {
          setSyncStatus('syncing');
          await firebaseSync.saveData({
            todos,
            goals: JSON.parse(localStorage.getItem('goals') || '[]'),
            reminders: JSON.parse(localStorage.getItem('reminders') || '[]'),
            dailyChecklistItems: JSON.parse(localStorage.getItem('dailyChecklistItems') || '[]'),
            dailyChecklistLastReset: localStorage.getItem('dailyChecklistLastReset') || new Date().toDateString(),
            achievements: JSON.parse(localStorage.getItem('achievements') || '{}')
          });
          setSyncStatus('synced');
          setTimeout(() => setSyncStatus('idle'), 1500);
        } catch (error) {
          console.error('Firebase sync error:', error);
          setSyncStatus('error');
        }
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [todos, firebaseSync, user]);

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
    localStorage.setItem('goalsCollapsed', goalsCollapsed);
  }, [goalsCollapsed]);

  useEffect(() => {
    localStorage.setItem('remindersCollapsed', remindersCollapsed);
  }, [remindersCollapsed]);

  useEffect(() => {
    localStorage.setItem('achievementsCollapsed', achievementsCollapsed);
  }, [achievementsCollapsed]);

  useEffect(() => {
    localStorage.setItem('heatmapCollapsed', heatmapCollapsed);
  }, [heatmapCollapsed]);

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

  // Firebase: Handle user authentication changes
  const handleAuthChange = useCallback(async (currentUser) => {
    console.log('=== handleAuthChange CALLED ===', currentUser);
    setUser(currentUser);

    if (currentUser) {
      // Check if offline user
      if (currentUser.uid === 'offline-user') {
        console.log('Offline user detected, skipping Firebase sync');
        setSyncStatus('offline');
        return;
      }

      // User logged in with real account
      console.log('Real user logged in, setting up Firebase sync');
      const sync = new FirebaseSync(currentUser.uid);
      setFirebaseSync(sync);

      try {
        setSyncStatus('syncing');
        // Load data from Firebase
        const firebaseData = await sync.loadData();

        if (firebaseData) {
          // Firebase'de veri var, localStorage'ı güncelle
          syncFirebaseToLocalStorage(firebaseData);

          // State'leri güncelle
          if (firebaseData.todos) setTodos(firebaseData.todos);

          setSyncStatus('synced');
        } else {
          // Firebase'de veri yok, localStorage'daki veriyi Firebase'e yükle
          await syncLocalStorageToFirebase(currentUser.uid);
          setSyncStatus('synced');
        }

        // Real-time sync'i başlat
        sync.subscribeToChanges((data) => {
          syncFirebaseToLocalStorage(data);
          if (data.todos) setTodos(data.todos);
        });

        setTimeout(() => setSyncStatus('idle'), 2000);
      } catch (error) {
        console.error('Error during Firebase sync:', error);
        setSyncStatus('offline');
      }
    } else {
      // User logged out
      console.log('User logged out');
      if (firebaseSync) {
        firebaseSync.cleanup();
      }
      setFirebaseSync(null);
      setSyncStatus('offline');
    }
  }, [firebaseSync]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Manual refresh function to sync data from Firebase
  const refreshFromFirebase = async () => {
    if (!firebaseSync || !user || user.uid === 'offline-user') {
      console.log('Cannot refresh: No Firebase sync available');
      return;
    }

    try {
      setSyncStatus('syncing');
      const firebaseData = await firebaseSync.loadData();

      if (firebaseData) {
        syncFirebaseToLocalStorage(firebaseData);
        if (firebaseData.todos) setTodos(firebaseData.todos);
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Error refreshing from Firebase:', error);
      setSyncStatus('offline');
    }
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
    const categoryTodos = todos.filter(t => t.category === category);
    const otherTodos = todos.filter(t => t.category !== category);

    const [removed] = categoryTodos.splice(startIndex, 1);
    categoryTodos.splice(endIndex, 0, removed);

    const reorderedCategoryTodos = categoryTodos.map((todo, index) => ({
      ...todo,
      order: index
    }));

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

  // Section definitions
  const sections = {
    todos: {
      id: 'todos',
      title: 'To-Do Lists',
      collapsed: todoCollapsed,
      setCollapsed: setTodoCollapsed,
      content: (
        <>
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
        </>
      )
    },
    references: {
      id: 'references',
      title: 'References',
      collapsed: referencesCollapsed,
      setCollapsed: setReferencesCollapsed,
      content: <ReferencePanel />
    },
    flashcards: {
      id: 'flashcards',
      title: 'Flash Cards',
      collapsed: flashCardsCollapsed,
      setCollapsed: setFlashCardsCollapsed,
      content: <FlashCards />
    },
    goals: {
      id: 'goals',
      title: 'Goals',
      collapsed: goalsCollapsed,
      setCollapsed: setGoalsCollapsed,
      content: <Goals />
    },
    reminders: {
      id: 'reminders',
      title: 'Study Reminders',
      collapsed: remindersCollapsed,
      setCollapsed: setRemindersCollapsed,
      content: <StudyReminders />
    },
    achievements: {
      id: 'achievements',
      title: 'Achievements',
      collapsed: achievementsCollapsed,
      setCollapsed: setAchievementsCollapsed,
      content: <Achievements />
    }
  };

  // Kullanıcı giriş yapmamışsa Auth ekranını göster
  if (!user) {
    return <Auth onAuthChange={handleAuthChange} />;
  }

  return (
    <div className="container">
      <div className="header-row">
        <h1>BankoSpace</h1>
        <div className="header-middle">
          {syncStatus === 'syncing' && <span className="sync-status">Syncing...</span>}
          {syncStatus === 'synced' && <span className="sync-status synced">Synced ✓</span>}
        </div>
        <div className="header-right">
          {user && user.uid !== 'offline-user' && (
            <button
              onClick={refreshFromFirebase}
              className="refresh-btn"
              title="Refresh from cloud"
              disabled={syncStatus === 'syncing'}
            >
              🔄
            </button>
          )}
          <Auth user={user} onAuthChange={handleAuthChange} />
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="settings-btn"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Settings dropdown menu */}
      {showSettings && (
        <div className="settings-dropdown">
          <div className="settings-dropdown-content">
            <button onClick={() => { toggleTheme(); setShowSettings(false); }} className="settings-item">
              {theme === 'dark' ? '☀️' : '🌙'} Toggle Theme ({theme === 'dark' ? 'Light' : 'Dark'})
            </button>
            <button onClick={() => { exportData(); setShowSettings(false); }} className="settings-item">
              📥 Export Data
            </button>
            <button onClick={() => { importData(); setShowSettings(false); }} className="settings-item">
              📤 Import Data
            </button>
            <div className="settings-divider"></div>
            <button onClick={() => { resetAllData(); setShowSettings(false); }} className="settings-item danger">
              🗑️ Reset All Data
            </button>
          </div>
        </div>
      )}

      <div className="content-wrapper">
        <div className="left-sidebar">
          <div className="app-section sidebar-section">
            <div
              className="section-unified-header"
              onClick={() => setGoalsCollapsed(!goalsCollapsed)}
            >
              <div className="section-header-left">
                <h2>Goals</h2>
                <span className="collapse-indicator">{goalsCollapsed ? '▼' : '▲'}</span>
              </div>
            </div>
            <div className={`section-content ${goalsCollapsed ? 'collapsed' : ''}`}>
              <Goals />
            </div>
          </div>

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

          <div className="app-section sidebar-section">
            <div
              className="section-unified-header"
              onClick={() => setHeatmapCollapsed(!heatmapCollapsed)}
            >
              <div className="section-header-left">
                <h2>Login Heat</h2>
                <span className="collapse-indicator">{heatmapCollapsed ? '▼' : '▲'}</span>
              </div>
            </div>
            <div className={`section-content ${heatmapCollapsed ? 'collapsed' : ''}`}>
              <ProductivityHeatmap />
            </div>
          </div>
        </div>

        <div className={`main-content-area ${!todoCollapsed ? 'expanded' : (todoCollapsed && referencesCollapsed) ? 'collapsed' : ''}`}>
          {sectionOrder.map((sectionId) => {
          const section = sections[sectionId];
          if (!section) return null;

          return (
            <div key={sectionId} className="app-section">
              <div
                className="section-unified-header"
                onClick={() => section.setCollapsed(!section.collapsed)}
              >
                <div className="section-header-left">
                  <h2>{section.title}</h2>
                  <span className="collapse-indicator">{section.collapsed ? '▼' : '▲'}</span>
                </div>
              </div>
              <div className={`section-content ${section.collapsed ? 'collapsed' : ''}`}>
                {section.content}
              </div>
            </div>
          );
        })}
        </div>

        <div className="right-sidebar">
        <div className="app-section sidebar-section">
          <div
            className="section-unified-header"
            onClick={() => setRemindersCollapsed(!remindersCollapsed)}
          >
            <div className="section-header-left">
              <h2>Study Reminders</h2>
              <span className="collapse-indicator">{remindersCollapsed ? '▼' : '▲'}</span>
            </div>
          </div>
          <div className={`section-content ${remindersCollapsed ? 'collapsed' : ''}`}>
            <StudyReminders />
          </div>
        </div>

        <div className="app-section sidebar-section">
          <div
            className="section-unified-header"
            onClick={() => setDailyChecklistCollapsed(!dailyChecklistCollapsed)}
          >
            <div className="section-header-left">
              {editingChecklistId === 'daily' ? (
                <input
                  className="category-name-input"
                  value={checklistNames.daily}
                  onChange={(e) => setChecklistNames({ ...checklistNames, daily: e.target.value })}
                  onBlur={() => setEditingChecklistId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingChecklistId(null);
                    if (e.key === 'Escape') setEditingChecklistId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <h2 onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingChecklistId('daily');
                }}>{checklistNames.daily}</h2>
              )}
              <span className="collapse-indicator">{dailyChecklistCollapsed ? '▼' : '▲'}</span>
            </div>
          </div>
          <div className={`section-content ${dailyChecklistCollapsed ? 'collapsed' : ''}`}>
            <DailyChecklist />
          </div>
        </div>

        <div className="app-section sidebar-section">
          <div
            className="section-unified-header"
            onClick={() => setLongtermChecklistCollapsed(!longtermChecklistCollapsed)}
          >
            <div className="section-header-left">
              {editingChecklistId === 'longterm' ? (
                <input
                  className="category-name-input"
                  value={checklistNames.longterm}
                  onChange={(e) => setChecklistNames({ ...checklistNames, longterm: e.target.value })}
                  onBlur={() => setEditingChecklistId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingChecklistId(null);
                    if (e.key === 'Escape') setEditingChecklistId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <h2 onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingChecklistId('longterm');
                }}>{checklistNames.longterm}</h2>
              )}
              <span className="collapse-indicator">{longtermChecklistCollapsed ? '▼' : '▲'}</span>
            </div>
          </div>
          <div className={`section-content ${longtermChecklistCollapsed ? 'collapsed' : ''}`}>
            <DailyChecklist storageKey="longtermChecklist" />
          </div>
        </div>

        <div className="app-section sidebar-section">
          <div
            className="section-unified-header"
            onClick={() => setAchievementsCollapsed(!achievementsCollapsed)}
          >
            <div className="section-header-left">
              <h2>Achievements</h2>
              <span className="collapse-indicator">{achievementsCollapsed ? '▼' : '▲'}</span>
            </div>
          </div>
          <div className={`section-content ${achievementsCollapsed ? 'collapsed' : ''}`}>
            <Achievements />
          </div>
        </div>
        </div>
      </div>

      <div className="version-badge">v4.3</div>
    </div>
  );
}

export default App;
