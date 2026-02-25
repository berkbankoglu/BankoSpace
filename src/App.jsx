import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import CategoryColumn from './components/CategoryColumn';
import ReferencePanel from './components/ReferencePanel';
import Timer from './components/Timer';
import FlashCards from './components/FlashCards';
import DailyChecklist from './components/DailyChecklist';
import IncomeTracker from './components/IncomeTracker';
import Notes from './components/Notes';
import Calendar from './components/Calendar';
import QuickNote from './components/QuickNote';
import { playClickSound, playCompleteSound, playUncompleteSound, playDeleteSound, playNavSound, playAddSound, playTypeSoundThrottled, setVolume, getVolume } from './utils/sounds';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';

const APP_VERSION = '3.0.0';

function App() {
  // Check if this is a popup window
  const popupType = new URLSearchParams(window.location.search).get('popup');

  // If popup mode, show appropriate component
  if (popupType === 'reference') {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#1a1a1a' }}>
        <ReferencePanel />
      </div>
    );
  }

  // Timer popup mode
  if (popupType === 'timer') {
    const isCompact = new URLSearchParams(window.location.search).get('compact') === '1';
    return <TimerPopupWrapper isCompact={isCompact} />;
  }

  // QuickNote popup mode
  if (popupType === 'quicknote') {
    return <QuickNotePopupWrapper />;
  }

  const [showUpdateWarning, setShowUpdateWarning] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Auto-update check disabled - no overlay
  // useEffect(() => {
  //   const checkForUpdates = async () => {
  //     try {
  //       console.log('Checking for updates...');
  //       const update = await check();
  //       if (update) {
  //         console.log(`Update available: ${update.version} (current: ${update.currentVersion})`);
  //         setUpdateAvailable(update);
  //       } else {
  //         console.log('No updates available');
  //       }
  //     } catch (error) {
  //       console.error('Failed to check for updates:', error);
  //     }
  //   };
  //   checkForUpdates();
  //   const interval = setInterval(checkForUpdates, 10 * 60 * 1000);
  //   return () => clearInterval(interval);
  // }, []);

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
  const [showSidebarSettings, setShowSidebarSettings] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [soundVolume, setSoundVolume] = useState(() => getVolume());
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarItems, setSidebarItems] = useState(() => {
    const saved = localStorage.getItem('sidebarOrder');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.find(item => item.id === 'calendar')) {
        parsed.splice(1, 0, { id: 'calendar', label: 'Calendar', view: 'calendar' });
      }
      if (!parsed.find(item => item.id === 'quicknote')) {
        parsed.push({ id: 'quicknote', label: 'Quick Note', view: 'quicknote' });
      }
      localStorage.setItem('sidebarOrder', JSON.stringify(parsed));
      return parsed;
    }
    return [
      { id: 'dashboard', label: 'Dashboard', view: 'dashboard' },
      { id: 'calendar', label: 'Calendar', view: 'calendar' },
      { id: 'references', label: 'References', view: 'references' },
      { id: 'flashcards', label: 'Flash Cards', view: 'flashcards' },
      { id: 'checklists', label: 'Checklists', view: 'checklists' },
      { id: 'income', label: 'Income Tracker', view: 'income' },
      { id: 'notes', label: 'Notes', view: 'notes' },
      { id: 'quicknote', label: 'Quick Note', view: 'quicknote' },
    ];
  });
  const [draggedSidebarItem, setDraggedSidebarItem] = useState(null);
  const todosHistoryRef = useRef([]);
  const MAX_UNDO_STEPS = 30;

  const pushHistory = (currentTodos) => {
    todosHistoryRef.current.push(JSON.parse(JSON.stringify(currentTodos)));
    if (todosHistoryRef.current.length > MAX_UNDO_STEPS) {
      todosHistoryRef.current.shift();
    }
  };

  const undo = () => {
    if (todosHistoryRef.current.length === 0) return;
    const prev = todosHistoryRef.current.pop();
    setTodos(prev);
  };

  const sidebarDragPosRef = useRef({ x: 0, y: 0 });
  const sidebarDragOffsetRef = useRef({ x: 0, y: 0 });
  const sidebarGhostRef = useRef(null);
  const sidebarPositionsRef = useRef({});
  const sidebarReorderLockRef = useRef(false);
  const sidebarHoldTimerRef = useRef(null);
  const sidebarDragJustEndedRef = useRef(false);
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


  // Save sidebar order
  useEffect(() => {
    localStorage.setItem('sidebarOrder', JSON.stringify(sidebarItems));
  }, [sidebarItems]);

  // Sidebar drag & drop handlers - using refs for smooth performance
  const handleSidebarDragStart = useCallback((e, item, index) => {
    if (e.button !== 0) return;
    if (!e.target.closest('.sidebar-drag-handle')) return; // Sadece drag handle'dan
    const rect = e.currentTarget.getBoundingClientRect();
    sidebarDragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    sidebarDragPosRef.current = { x: e.clientX, y: e.clientY };
    setDraggedSidebarItem({ item, index, width: rect.width, height: rect.height });

    // Position ghost immediately
    requestAnimationFrame(() => {
      if (sidebarGhostRef.current) {
        sidebarGhostRef.current.style.left = `${e.clientX - sidebarDragOffsetRef.current.x}px`;
        sidebarGhostRef.current.style.top = `${e.clientY - sidebarDragOffsetRef.current.y}px`;
      }
    });
    e.preventDefault();
  }, []);

  const handleSidebarDragMove = useCallback((e) => {
    if (!draggedSidebarItem) return;

    // Move ghost directly via ref - no state update needed
    if (sidebarGhostRef.current) {
      sidebarGhostRef.current.style.left = `${e.clientX - sidebarDragOffsetRef.current.x}px`;
      sidebarGhostRef.current.style.top = `${e.clientY - sidebarDragOffsetRef.current.y}px`;
    }

    // Throttle reorder with lock
    if (sidebarReorderLockRef.current) return;

    const items = document.querySelectorAll('.sidebar-item[data-sidebar-id]');
    for (const el of items) {
      const rect = el.getBoundingClientRect();
      if (e.clientY > rect.top && e.clientY < rect.bottom) {
        const targetId = el.getAttribute('data-sidebar-id');
        if (targetId && targetId !== draggedSidebarItem.item.id) {
          // Lock reorder for duration of animation
          sidebarReorderLockRef.current = true;

          // Capture old positions
          const oldPositions = {};
          items.forEach(item => {
            const id = item.getAttribute('data-sidebar-id');
            if (id) oldPositions[id] = item.getBoundingClientRect();
          });
          sidebarPositionsRef.current = oldPositions;

          playClickSound();
          setSidebarItems(prev => {
            const dragIdx = prev.findIndex(i => i.id === draggedSidebarItem.item.id);
            const targetIdx = prev.findIndex(i => i.id === targetId);
            if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return prev;
            const newItems = [...prev];
            const [removed] = newItems.splice(dragIdx, 1);
            newItems.splice(targetIdx, 0, removed);
            return newItems;
          });
          setDraggedSidebarItem(prev => prev ? { ...prev, index: -1 } : null);

          setTimeout(() => { sidebarReorderLockRef.current = false; }, 280);
          break;
        }
      }
    }
  }, [draggedSidebarItem]);

  const handleSidebarDragEnd = useCallback(() => {
    setDraggedSidebarItem(null);
  }, []);

  useEffect(() => {
    if (draggedSidebarItem) {
      document.addEventListener('mousemove', handleSidebarDragMove);
      document.addEventListener('mouseup', handleSidebarDragEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleSidebarDragMove);
        document.removeEventListener('mouseup', handleSidebarDragEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [draggedSidebarItem, handleSidebarDragMove, handleSidebarDragEnd]);

  // FLIP animation for sidebar reorder
  useEffect(() => {
    const oldPos = sidebarPositionsRef.current;
    if (Object.keys(oldPos).length === 0) return;

    const items = document.querySelectorAll('.sidebar-item[data-sidebar-id]');
    items.forEach(el => {
      const id = el.getAttribute('data-sidebar-id');
      if (!id || !oldPos[id]) return;
      const newRect = el.getBoundingClientRect();
      const deltaY = oldPos[id].top - newRect.top;
      if (Math.abs(deltaY) > 1) {
        el.style.transform = `translateY(${deltaY}px)`;
        el.style.transition = 'none';
        el.offsetHeight;
        el.style.transform = '';
        el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
      }
    });
    sidebarPositionsRef.current = {};
  }, [sidebarItems]);

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

  // Animated close for sidebar settings
  const closeSidebarSettings = () => {
    if (!showSidebarSettings || settingsClosing) return;
    setSettingsClosing(true);
    setTimeout(() => {
      setShowSidebarSettings(false);
      setSettingsClosing(false);
    }, 220);
  };

  // Close sidebar settings when clicking outside
  useEffect(() => {
    if (!showSidebarSettings) return;
    const handleClick = (e) => {
      if (!e.target.closest('.sidebar-settings-dropdown') && !e.target.closest('.sidebar-gear-btn')) {
        closeSidebarSettings();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSidebarSettings, settingsClosing]);

  // Ctrl+Z undo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);


  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };


  const addTodo = (category, text, dueDate = null) => {
    pushHistory(todos);
    const newTodo = {
      id: Date.now(),
      text,
      category,
      completed: false,
      createdAt: Date.now(),
      dueDate,
      subtasks: [],
      order: todos.filter(t => t.category === category).length
    };
    setTodos([newTodo, ...todos]);
    playAddSound();
  };

  const addSubtask = (todoId, subtaskText) => {
    pushHistory(todos);
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
    pushHistory(todos);
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
    pushHistory(todos);
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

  const updateSubtask = (todoId, subtaskId, newText) => {
    setTodos(todos.map(todo => {
      if (todo.id === todoId) {
        return {
          ...todo,
          subtasks: (todo.subtasks || []).map(st =>
            st.id === subtaskId ? { ...st, text: newText } : st
          )
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
    pushHistory(todos);
    const todo = todos.find(t => t.id === id);
    if (todo) {
      if (!todo.completed) playCompleteSound();
      else playUncompleteSound();
    }
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
    pushHistory(todos);
    playDeleteSound();
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const updateTodo = (id, updates) => {
    pushHistory(todos);
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, ...updates } : todo
    ));
  };

  // Todo drag & drop state (swap-based)
  const [draggingTodo, setDraggingTodo] = useState(null);
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const [dragOverTodoId, setDragOverTodoId] = useState(null);
  const todoDragOffsetRef = useRef({ x: 0, y: 0 });
  const todoDragGhostRef = useRef(null);
  const todoPositionsRef = useRef({});
  const dragOverCategoryRef = useRef(null);
  const dragOverTodoRef = useRef(null);
  const todoHoldTimerRef = useRef(null);

  const handleTodoDragStart = useCallback((e, todo) => {
    if (e.button !== 0) return;
    if (!e.target.closest('.cc-drag-handle')) return; // Sadece drag handle'dan

    const itemEl = e.target.closest('.cc-item');
    if (!itemEl) return;

    const rect = itemEl.getBoundingClientRect();
    todoDragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    pushHistory(todos);
    setDraggingTodo({ todo, width: rect.width, height: rect.height });

    requestAnimationFrame(() => {
      if (todoDragGhostRef.current) {
        todoDragGhostRef.current.style.left = `${e.clientX - todoDragOffsetRef.current.x}px`;
        todoDragGhostRef.current.style.top = `${e.clientY - todoDragOffsetRef.current.y}px`;
      }
    });
    e.preventDefault();
  }, [todos]);

  const handleTodoDragMove = useCallback((e) => {
    if (!draggingTodo) return;

    // Move ghost via ref
    if (todoDragGhostRef.current) {
      todoDragGhostRef.current.style.left = `${e.clientX - todoDragOffsetRef.current.x}px`;
      todoDragGhostRef.current.style.top = `${e.clientY - todoDragOffsetRef.current.y}px`;
    }

    // Detect which column we're over
    const columns = document.querySelectorAll('.category-column-v2');
    let foundCategory = null;
    columns.forEach(col => {
      const rect = col.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        foundCategory = col.dataset.category;
      }
    });
    dragOverCategoryRef.current = foundCategory;
    setDragOverCategory(foundCategory);

    // Find which todo the cursor is hovering over
    if (!foundCategory) {
      dragOverTodoRef.current = null;
      setDragOverTodoId(null);
      return;
    }

    const hoveredColumn = document.querySelector(`.category-column-v2[data-category="${foundCategory}"]`);
    if (!hoveredColumn) return;

    const todoElements = Array.from(hoveredColumn.querySelectorAll('.cc-item[data-todo-id]'));
    const dragId = String(draggingTodo.todo.id);
    let hoveredTodoId = null;

    for (const el of todoElements) {
      const id = el.getAttribute('data-todo-id');
      if (id === dragId) continue;
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        hoveredTodoId = id;
        break;
      }
    }

    dragOverTodoRef.current = hoveredTodoId;
    setDragOverTodoId(hoveredTodoId);
  }, [draggingTodo]);

  const handleTodoDragEnd = useCallback(() => {
    if (!draggingTodo) {
      setDraggingTodo(null);
      setDragOverCategory(null);
      setDragOverTodoId(null);
      dragOverCategoryRef.current = null;
      dragOverTodoRef.current = null;
      return;
    }

    const overTodoId = dragOverTodoRef.current;
    const overCategory = dragOverCategoryRef.current;
    const dragId = draggingTodo.todo.id;

    if (overTodoId) {
      // Capture old positions for FLIP animation
      const allTodoElements = document.querySelectorAll('.cc-item[data-todo-id]');
      const oldPositions = {};
      allTodoElements.forEach(item => {
        const id = item.getAttribute('data-todo-id');
        if (id) oldPositions[id] = item.getBoundingClientRect();
      });
      todoPositionsRef.current = oldPositions;

      // Swap the two todos
      playClickSound();
      setTodos(prev => {
        const dragItem = prev.find(t => String(t.id) === String(dragId));
        const targetItem = prev.find(t => String(t.id) === String(overTodoId));
        if (!dragItem || !targetItem) return prev;

        return prev.map(t => {
          if (String(t.id) === String(dragId)) {
            return { ...t, order: targetItem.order, category: targetItem.category };
          }
          if (String(t.id) === String(overTodoId)) {
            return { ...t, order: dragItem.order, category: dragItem.category };
          }
          return t;
        });
      });
    } else if (overCategory && overCategory !== draggingTodo.todo.category) {
      // Dropped on empty area of a different column - move to that column
      setTodos(prev => prev.map(t =>
        t.id === dragId ? { ...t, category: overCategory } : t
      ));
    }

    setDraggingTodo(null);
    setDragOverCategory(null);
    setDragOverTodoId(null);
    dragOverCategoryRef.current = null;
    dragOverTodoRef.current = null;
  }, [draggingTodo]);

  useEffect(() => {
    if (draggingTodo) {
      document.addEventListener('mousemove', handleTodoDragMove);
      document.addEventListener('mouseup', handleTodoDragEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleTodoDragMove);
        document.removeEventListener('mouseup', handleTodoDragEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [draggingTodo, handleTodoDragMove, handleTodoDragEnd]);

  // FLIP animation for todo reorder
  useEffect(() => {
    const oldPositions = todoPositionsRef.current;
    if (Object.keys(oldPositions).length === 0) return;

    const todoElements = document.querySelectorAll('.cc-item[data-todo-id]');
    todoElements.forEach(el => {
      const id = el.getAttribute('data-todo-id');
      if (!id || !oldPositions[id]) return;
      const newRect = el.getBoundingClientRect();
      const deltaY = oldPositions[id].top - newRect.top;
      const deltaX = oldPositions[id].left - newRect.left;
      if (Math.abs(deltaY) > 1 || Math.abs(deltaX) > 1) {
        el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        el.style.transition = 'none';
        el.offsetHeight; // Force reflow
        el.style.transform = '';
        el.style.transition = 'transform 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)';
      }
    });
    todoPositionsRef.current = {};
  }, [todos]);

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


  // Window control functions
  const minimizeWindow = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('Failed to minimize:', err);
    }
  };

  const maximizeWindow = async () => {
    try {
      const window = getCurrentWindow();
      const isMaximized = await window.isMaximized();
      if (isMaximized) {
        await window.unmaximize();
      } else {
        await window.maximize();
      }
    } catch (err) {
      console.error('Failed to toggle maximize:', err);
    }
  };

  const closeWindow = async () => {
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to close:', err);
    }
  };

  return (
    <div className="container">
      {/* Custom Title Bar */}
      <div
        className="custom-titlebar"
        onDoubleClick={(e) => {
          if (e.target.closest('.titlebar-controls') === null) {
            maximizeWindow();
          }
        }}
      >
        <div className="titlebar-title">BankoSpace</div>
        <div className="titlebar-controls">
          <button className="titlebar-btn minimize" onClick={minimizeWindow}>─</button>
          <button className="titlebar-btn maximize" onClick={maximizeWindow}>□</button>
          <button className="titlebar-btn close" onClick={closeWindow}>×</button>
        </div>
      </div>

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

      {/* Auto-update notification modal - disabled */}

      <div className="content-wrapper">
        {/* Left Sidebar - Notion Style */}
        <div className={`notion-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Sidebar Header */}
          <div className="sidebar-header">
            <div className="sidebar-title">
              {!sidebarCollapsed && <span>BankoSpace</span>}
            </div>
            <div className="sidebar-header-actions">
              {!sidebarCollapsed && (
                <button
                  className="sidebar-gear-btn"
                  onClick={(e) => { e.stopPropagation(); playClickSound(); if (showSidebarSettings) { closeSidebarSettings(); } else { setShowSidebarSettings(true); } }}
                  title="Settings"
                >
                  ⚙
                </button>
              )}
              <button
                className="sidebar-toggle"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
            </div>
          </div>

          {/* Sidebar Settings Dropdown */}
          {showSidebarSettings && !sidebarCollapsed && (
            <div className={`sidebar-settings-dropdown ${settingsClosing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
              <div className="sidebar-settings-section">
                <div className="sidebar-settings-row">
                  <span className="sidebar-settings-label">Volume</span>
                  <div className="sidebar-settings-right">
                    <button
                      className={`sidebar-mute-btn ${soundVolume === 0 ? 'muted' : ''}`}
                      onClick={() => {
                        if (soundVolume > 0) {
                          localStorage.setItem('soundVolumePrev', String(soundVolume));
                          setSoundVolume(0);
                          setVolume(0);
                        } else {
                          const prev = parseFloat(localStorage.getItem('soundVolumePrev') || '0.7');
                          setSoundVolume(prev);
                          setVolume(prev);
                          playClickSound();
                        }
                      }}
                      title={soundVolume === 0 ? 'Unmute' : 'Mute'}
                    >
                      {soundVolume === 0 ? '🔇' : soundVolume < 0.4 ? '🔉' : '🔊'}
                    </button>
                    <span className="sidebar-settings-value">{Math.round(soundVolume * 100)}%</span>
                  </div>
                </div>
                <input
                  type="range"
                  className="sidebar-volume-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundVolume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setSoundVolume(v);
                    setVolume(v);
                  }}
                  onMouseUp={() => playClickSound()}
                />
              </div>
              <div className="sidebar-settings-divider" />
              <div className="sidebar-settings-section">
                <button
                  className="sidebar-settings-action-btn"
                  onClick={() => { exportData(); closeSidebarSettings(); }}
                >
                  Export Data
                </button>
                <button
                  className="sidebar-settings-action-btn"
                  onClick={() => { importData(); closeSidebarSettings(); }}
                >
                  Import Data
                </button>
                <button
                  className="sidebar-settings-action-btn danger"
                  onClick={() => { resetAllData(); closeSidebarSettings(); }}
                >
                  Reset All Data
                </button>
              </div>
              <div className="sidebar-settings-divider" />
              <div className="sidebar-settings-version">BankoSpace v{APP_VERSION}</div>
            </div>
          )}

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
                    onChange={(e) => { playTypeSoundThrottled(); handleSearch(e.target.value); }}
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

              {/* Draggable Sidebar Items */}
              {sidebarItems.map((item, index) => (
                <div
                  key={item.id}
                  data-sidebar-id={item.id}
                  className={`sidebar-item ${item.id === 'dashboard' ? 'main-item' : ''} ${activeView === item.view ? 'active' : ''} ${draggedSidebarItem?.item.id === item.id ? 'sidebar-dragging' : ''}`}
                  onMouseDown={(e) => handleSidebarDragStart(e, item, index)}
                  onClick={() => {
                    if (draggedSidebarItem) return;
                    playNavSound();
                    setActiveView(item.view);
                  }}
                >
                  <span className="item-name">{item.label}</span>
                  <span className="sidebar-drag-handle">⠿</span>
                </div>
              ))}

              {/* Floating sidebar drag ghost */}
              {draggedSidebarItem && (
                <div
                  ref={sidebarGhostRef}
                  className="sidebar-drag-ghost"
                  style={{
                    width: draggedSidebarItem.width,
                  }}
                >
                  <span className="item-name">{draggedSidebarItem.item.label}</span>
                  <span className="sidebar-drag-handle">⠿</span>
                </div>
              )}

              {/* Settings moved to gear icon in header */}
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
                  <DailyChecklist
                    title={checklistNames.daily}
                    onTitleChange={(newTitle) => setChecklistNames(prev => ({ ...prev, daily: newTitle }))}
                  />
                </div>
                <div className="checklist-section">
                  <DailyChecklist
                    storageKey="longtermChecklist"
                    title={checklistNames.longterm}
                    onTitleChange={(newTitle) => setChecklistNames(prev => ({ ...prev, longterm: newTitle }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Income Tracker Full Screen View */}
          {activeView === 'income' && (
            <div className="income-fullscreen">
              <IncomeTracker />
            </div>
          )}

          {/* Notes Full Screen View */}
          {activeView === 'notes' && (
            <div className="notes-fullscreen">
              <Notes />
            </div>
          )}

          {activeView === 'quicknote' && (
            <div className="quicknote-fullscreen">
              <div className="quicknote-page-header">
                <h2 className="quicknote-page-title">Quick Note</h2>
                <button
                  className="quicknote-popup-btn"
                  onClick={async () => {
                    playClickSound();
                    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                    const webview = new WebviewWindow('quicknote-popup', {
                      url: 'index.html?popup=quicknote',
                      title: 'Quick Note',
                      width: 620,
                      height: 500,
                      resizable: true,
                      alwaysOnTop: true,
                      decorations: false,
                      center: true,
                      focus: true,
                    });
                    webview.once('tauri://error', () => {});
                  }}
                  title="Open as popup"
                >
                  ↗
                </button>
              </div>
              <QuickNote isPopup={true} />
            </div>
          )}

          {/* Calendar Full Screen View */}
          {activeView === 'calendar' && (
            <div className="calendar-fullscreen">
              <Calendar
                todos={todos}
                onToggleTodo={toggleTodo}
                onUpdateTodo={updateTodo}
              />
            </div>
          )}

          {/* Dashboard View */}
          {activeView === 'dashboard' && (
          <div className="dashboard-container">
            {/* Dashboard Header */}
            <div className="dashboard-header">
              <h1 className="dashboard-title">Dashboard</h1>
              <div className="filters">
                <button
                  className={`filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
                  onClick={() => { playClickSound(); setCurrentFilter('all'); }}
                >
                  All
                </button>
                <button
                  className={`filter-btn ${currentFilter === 'active' ? 'active' : ''}`}
                  onClick={() => { playClickSound(); setCurrentFilter('active'); }}
                >
                  Active
                </button>
                <button
                  className={`filter-btn ${currentFilter === 'completed' ? 'active' : ''}`}
                  onClick={() => { playClickSound(); setCurrentFilter('completed'); }}
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
                <div className={`app-section ${todoCollapsed ? 'section-collapsed' : ''}`}>
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
                        onUpdateTodo={updateTodo}
                        onRename={renameCategory}
                        currentFilter={currentFilter}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        onDeleteSubtask={deleteSubtask}
                        onUpdateSubtask={updateSubtask}
                        onReorder={reorderTodos}
                        onTodoDragStart={handleTodoDragStart}
                        draggingTodo={draggingTodo}
                        dragOverCategory={dragOverCategory}
                        dragOverTodoId={dragOverTodoId}
                      />
                      <CategoryColumn
                        title={categoryNames.weekly}
                        category="weekly"
                        todos={todosByCategory.weekly}
                        onAddTodo={addTodo}
                        onToggleTodo={toggleTodo}
                        onDeleteTodo={deleteTodo}
                        onUpdateTodo={updateTodo}
                        onRename={renameCategory}
                        currentFilter={currentFilter}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        onDeleteSubtask={deleteSubtask}
                        onUpdateSubtask={updateSubtask}
                        onReorder={reorderTodos}
                        onTodoDragStart={handleTodoDragStart}
                        draggingTodo={draggingTodo}
                        dragOverCategory={dragOverCategory}
                        dragOverTodoId={dragOverTodoId}
                      />
                      <CategoryColumn
                        title={categoryNames.longterm}
                        category="longterm"
                        todos={todosByCategory.longterm}
                        onAddTodo={addTodo}
                        onToggleTodo={toggleTodo}
                        onDeleteTodo={deleteTodo}
                        onUpdateTodo={updateTodo}
                        onRename={renameCategory}
                        currentFilter={currentFilter}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        onDeleteSubtask={deleteSubtask}
                        onUpdateSubtask={updateSubtask}
                        onReorder={reorderTodos}
                        onTodoDragStart={handleTodoDragStart}
                        draggingTodo={draggingTodo}
                        dragOverCategory={dragOverCategory}
                        dragOverTodoId={dragOverTodoId}
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

      {/* Drag Ghost - Notes style */}
      {draggingTodo && (
        <div
          ref={todoDragGhostRef}
          className="todo-drag-ghost"
          style={{ width: draggingTodo.width }}
        >
          <div className="cc-item">
            <div className="cc-item-main">
              <div className="cc-drag-handle">⠿</div>
              <label className="cc-label">
                <span className="cc-checkmark"></span>
                <span className="cc-text">{draggingTodo.todo.text}</span>
              </label>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Timer Popup Wrapper Component
function TimerPopupWrapper({ isCompact = false }) {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);

  useEffect(() => {
    // Set always on top by default when popup opens
    const initAlwaysOnTop = async () => {
      try {
        await getCurrentWindow().setAlwaysOnTop(true);
      } catch (err) {
        console.error('Failed to set always on top:', err);
      }
    };
    initAlwaysOnTop();
  }, []);

  const toggleAlwaysOnTop = async () => {
    try {
      const newValue = !isAlwaysOnTop;
      await getCurrentWindow().setAlwaysOnTop(newValue);
      setIsAlwaysOnTop(newValue);
    } catch (err) {
      console.error('Failed to toggle always on top:', err);
    }
  };

  const closePopup = async () => {
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to close popup:', err);
    }
  };

  if (isCompact) {
    return (
      <div className="timer-mini-popup-container">
        <div className="timer-mini-popup-header">
          <span className="timer-mini-popup-title">Timer</span>
          <div className="timer-mini-popup-actions">
            <button
              className={`timer-mini-pin-btn ${isAlwaysOnTop ? 'active' : ''}`}
              onClick={toggleAlwaysOnTop}
              title={isAlwaysOnTop ? 'Unpin' : 'Pin'}
            >📌</button>
            <button className="timer-mini-close-btn" onClick={closePopup}>×</button>
          </div>
        </div>
        <Timer isPopup={true} isCompact={true} />
      </div>
    );
  }

  return (
    <div className="timer-popup-container">
      <div className="timer-popup-header">
        <span className="timer-popup-header-title">Timer</span>
        <div className="timer-popup-header-actions">
          <button
            className={`timer-popup-pin-btn ${isAlwaysOnTop ? 'active' : ''}`}
            onClick={toggleAlwaysOnTop}
            title={isAlwaysOnTop ? 'Unpin from top' : 'Pin to top'}
          >
            📌 {isAlwaysOnTop ? 'Pinned' : 'Pin'}
          </button>
          <button className="timer-popup-close-btn" onClick={closePopup} title="Close">
            ×
          </button>
        </div>
      </div>
      <div className="timer-popup-body">
        <Timer isPopup={true} />
      </div>
    </div>
  );
}

function QuickNotePopupWrapper() {
  const closePopup = async () => {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      await getCurrentWebviewWindow().close();
    } catch {
      try { await getCurrentWindow().close(); } catch {
        try { await getCurrentWindow().destroy(); } catch {}
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        await getCurrentWebviewWindow().setAlwaysOnTop(true);
      } catch {
        try { await getCurrentWindow().setAlwaysOnTop(true); } catch {}
      }
    };
    init();

    const handleKey = (e) => {
      if (e.key === 'Escape') closePopup();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="qn-popup-container">
      <div className="qn-popup-header">
        <span className="qn-popup-header-title">Quick Note</span>
        <div className="qn-popup-header-actions">
          <button className="qn-popup-close-btn" onClick={closePopup} title="Close">×</button>
        </div>
      </div>
      <div className="qn-popup-body">
        <QuickNote isPopup={true} onClose={closePopup} />
      </div>
    </div>
  );
}

export default App;
