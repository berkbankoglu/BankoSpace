import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { supabase, pullFromSupabase, pushKeyToSupabase, pushAllToSupabase, SYNC_KEYS } from './supabase';
import Login from './components/Login';
import CategoryColumn from './components/CategoryColumn';
import ReferencePanel from './components/ReferencePanel';
import Timer from './components/Timer';
import FlashCards from './components/FlashCards';
import DailyChecklist from './components/DailyChecklist';
import IncomeTracker from './components/IncomeTracker';
import Notes from './components/Notes';
import FitnessTracker from './components/FitnessTracker';
import Calendar from './components/Calendar';
import JapaneseKana from './components/JapaneseKana';
import ToolsChat from './components/ToolsChat';
import SubscriptionTracker, { SubscriptionWidget, SubscriptionPopup } from './components/SubscriptionTracker';
import StockNews from './components/StockNews';
import Translate from './components/Translate';
import ProjectBid from './components/ProjectBid';

const QUICK_BUTTONS = [
  { id: 'translate',  label: 'Translate',   desc: 'T' },
  { id: 'bid',        label: 'AI Generate', desc: 'W' },
];

function QuickLaunchPanel() {
  const [activePopup, setActivePopup] = useState(null);

  const openPopup = (id) => setActivePopup(id);
  const closePopup = () => setActivePopup(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { closePopup(); return; }
      if (activePopup) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); openPopup('translate'); }
      if (e.key === 'w' || e.key === 'W') { e.preventDefault(); openPopup('bid'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePopup]);

  const renderPopupContent = () => {
    switch (activePopup) {
      case 'translate': return <Translate />;
      case 'bid': return <ProjectBid />;
      default: return null;
    }
  };

  const getPopupTitle = () => {
    const btn = QUICK_BUTTONS.find(b => b.id === activePopup);
    return btn?.label || '';
  };

  return (
    <>
      <div className="ql-panel">
        <div className="ql-title">Quick Launch</div>
        <div className="ql-grid">
          {QUICK_BUTTONS.map(btn => (
            <button key={btn.id} className="ql-btn" onClick={() => openPopup(btn.id)}>
              <span className="ql-label">{btn.label}</span>
              <span className="ql-desc">{btn.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {activePopup && renderPopupContent() && (
        <div className="ql-popup-overlay" onClick={closePopup}>
          <div className="ql-popup-modal" onClick={e => e.stopPropagation()}>
            <div className="ql-popup-header">
              <span className="ql-popup-title">{getPopupTitle()}</span>
              <button className="ql-popup-close" onClick={closePopup}>✕</button>
            </div>
            <div className="ql-popup-body">
              {renderPopupContent()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
import { playClickSound, playCompleteSound, playUncompleteSound, playDeleteSound, playNavSound, playAddSound, setVolume, getVolume } from './utils/sounds';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';

const APP_VERSION = '3.0.0';
const MIN_COL_PX = 220;
const DEFAULT_COL_PX = [null, null, null]; // [dailyPx, weeklyPx, monthlyPx] — null = auto (flex:1)

function App({ session, onLogout }) {
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


  // [dailyPx, stockPx] — Weekly is flex:1 in the middle, always fills remaining space
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashColWidths'));
      if (Array.isArray(saved) && saved.length === 3 &&
          saved.every(w => w === null || (typeof w === 'number' && w >= MIN_COL_PX && w <= 1200))) {
        // If saved px values exceed available width, reset to auto
        const total = saved.reduce((s, w) => s + (w || 0), 0);
        if (total > 0 && total > window.innerWidth - 260) return DEFAULT_COL_PX;
        return saved;
      }
    } catch {}
    return DEFAULT_COL_PX;
  });
  const colResizeRef = useRef(null);
  const columnsRef = useRef(null);

  // Reset column widths when window shrinks and saved px values no longer fit
  useEffect(() => {
    const container = columnsRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setColWidths(prev => {
        const hasFixed = prev.some(w => w !== null);
        if (!hasFixed) return prev;
        const total = prev.reduce((s, w) => s + (w || 0), 0);
        if (total > container.clientWidth) return DEFAULT_COL_PX;
        return prev;
      });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const startColResize = (handleIdx, e) => {
    e.preventDefault();
    const container = columnsRef.current;
    if (!container) return;

    const kids = Array.from(container.children).filter(el => !el.classList.contains('col-resize-handle'));
    const startPx = kids.map(el => el.getBoundingClientRect().width);
    // startPx[0]=daily, startPx[1]=weekly, startPx[2]=monthly
    const startX = e.clientX;
    const leftStart = startPx[handleIdx];
    const rightStart = startPx[handleIdx + 1];

    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const newLeft = Math.max(MIN_COL_PX, Math.min(leftStart + delta, leftStart + rightStart - MIN_COL_PX));
      const newRight = leftStart + rightStart - newLeft;
      const next = [...startPx];
      next[handleIdx] = newLeft;
      next[handleIdx + 1] = newRight;
      setColWidths([next[0], next[1], next[2]]);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setColWidths(prev => { localStorage.setItem('dashColWidths', JSON.stringify(prev)); return prev; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const [showUpdateWarning, setShowUpdateWarning] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // WebView2 donma önleme — pencere ön plana gelince force re-render
  useEffect(() => {
    const onVisible = () => {
      // Küçük bir state değişikliği ile React'i uyandır
      window.dispatchEvent(new Event('resize'));
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // Supabase sync — active automatically if session exists (runs once, not reactive to session prop)
  useEffect(() => {
    let mounted = true;
    const origSetItem = localStorage.setItem.bind(localStorage);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s || !mounted) return;

      const alreadySynced = sessionStorage.getItem('supabase_synced');
      if (!alreadySynced) {
        pullFromSupabase().then(pulled => {
          sessionStorage.setItem('supabase_synced', '1');
          if (pulled) window.location.reload();
        });
      }

      const debounceTimers = {};
      const pendingKeys = {};

      localStorage.setItem = function(key, value) {
        origSetItem(key, value);
        if (SYNC_KEYS.includes(key)) {
          pendingKeys[key] = value;
          clearTimeout(debounceTimers[key]);
          debounceTimers[key] = setTimeout(() => {
            pushKeyToSupabase(key, value);
            delete pendingKeys[key];
          }, 500);
        }
      };

      // Kapanmadan önce bekleyen tüm keyleri hemen gönder
      const flushAll = () => {
        Object.entries(pendingKeys).forEach(([key, value]) => {
          clearTimeout(debounceTimers[key]);
          pushKeyToSupabase(key, value);
        });
      };
      window.addEventListener('beforeunload', flushAll);

      const origRemoveItem = localStorage.removeItem.bind(localStorage);
      localStorage.removeItem = function(key) {
        origRemoveItem(key);
        if (SYNC_KEYS.includes(key)) {
          pushKeyToSupabase(key, null);
        }
      };

      return () => {
        window.removeEventListener('beforeunload', flushAll);
      };
    });

    return () => {
      mounted = false;
      localStorage.setItem = origSetItem;
    };
  }, []);

  // Auto-update check
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable(update);
        }
      } catch (error) {
        // Update check can fail silently
      }
    };
    checkForUpdates();
    const interval = setInterval(checkForUpdates, 10 * 60 * 1000); // 10 dakikada bir
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

  // Version check - for auto-update
  useEffect(() => {
    const savedVersion = localStorage.getItem('appVersion');
    if (savedVersion && savedVersion !== APP_VERSION) {
      console.log(`Version updated from ${savedVersion} to ${APP_VERSION}`);
      // Show old version warning
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
  const [showSubPopup, setShowSubPopup] = useState(false);
  const [showSidebarSettings, setShowSidebarSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('account');
  const [soundVolume, setSoundVolume] = useState(() => getVolume());
  const [activeView, setActiveView] = useState('dashboard');

  const [sidebarItems, setSidebarItems] = useState(() => {
    const defaults = [
      { id: 'dashboard',  label: 'Dashboard',      view: 'dashboard',  hidden: false },
      { id: 'calendar',   label: 'Calendar',        view: 'calendar',   hidden: false },
      { id: 'references', label: 'References',      view: 'references', hidden: false },
      { id: 'flashcards', label: 'Flash Cards',     view: 'flashcards', hidden: false },
      { id: 'checklists', label: 'Checklists',      view: 'checklists', hidden: false },
      { id: 'income',     label: 'Income Tracker',  view: 'income',     hidden: false },
      { id: 'notes',      label: 'Notes',           view: 'notes',      hidden: false },
      { id: 'tools',        label: 'Tools',            view: 'tools',        hidden: true },
      { id: 'japanesekana', label: 'Japanese Kana',    view: 'japanesekana', hidden: false },
      { id: 'fitness',      label: 'Fitness',           view: 'fitness',      hidden: false },
    ];
    const saved = localStorage.getItem('sidebarOrder');
    if (saved) {
      const parsed = JSON.parse(saved).filter(item => item.id !== 'quicknote');
      // Merge: keep saved order/hidden state, add any missing defaults
      const merged = parsed
        .filter(item => defaults.find(d => d.id === item.id))
        .map(item => {
          const def = defaults.find(d => d.id === item.id);
          const merged = { ...def, ...item };
          // Force hidden state for items that should always be hidden
          if (def.hidden) merged.hidden = true;
          return merged;
        });
      defaults.forEach(def => {
        if (!merged.find(m => m.id === def.id)) merged.push(def);
      });
      localStorage.setItem('sidebarOrder', JSON.stringify(merged));
      return merged;
    }
    return defaults;
  });
  const [draggedSidebarItem, setDraggedSidebarItem] = useState(null);

  const togglePageVisibility = (id) => {
    if (id === 'dashboard') return;
    const updated = sidebarItems.map(item =>
      item.id === id ? { ...item, hidden: !item.hidden } : item
    );
    setSidebarItems(updated);
    localStorage.setItem('sidebarOrder', JSON.stringify(updated));
    const toggled = updated.find(i => i.id === id);
    if (toggled?.hidden && activeView === toggled.view) setActiveView('dashboard');
  };

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Full sidebar collapsed

  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('todos');
    return saved ? JSON.parse(saved) : [];
  });
  const currentFilter = 'active';
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'dark';
  });

  // Collapse states for sections
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
  const [todoFontSize, setTodoFontSize] = useState(() => localStorage.getItem('todoFontSize') || 'M');
  const [subtaskFontSize, setSubtaskFontSize] = useState(() => localStorage.getItem('subtaskFontSize') || 'M');
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const fontSizeMap = { S: '11px', M: '13px', L: '16px', XL: '20px' };
  const subtaskFontSizeMap = { S: '11px', M: '14px', L: '17px', XL: '21px' };
  const [useEmoji, setUseEmoji] = useState(() => localStorage.getItem('useEmoji') !== 'false');
  const [timerWidgetOpen, setTimerWidgetOpen] = useState(false);
  const [timerWidgetCompact, setTimerWidgetCompact] = useState(true);
  const [timerWidgetPos, setTimerWidgetPos] = useState({ top: 0, left: 0 });
  const timerBtnRef = useRef(null);

  const handleTimerDragStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origTop = timerWidgetPos.top;
    const origLeft = timerWidgetPos.left;
    const onMove = (ev) => {
      setTimerWidgetPos({
        top: origTop + ev.clientY - startY,
        left: origLeft + ev.clientX - startX,
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
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
    const defaults = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', longterm: 'Long Term' };
    try {
      const saved = localStorage.getItem('categoryNames');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch { return defaults; }
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


  // Save to localStorage when todos change
  useEffect(() => {
    const timestamp = new Date().toISOString();
    localStorage.setItem('todos', JSON.stringify(todos));
    localStorage.setItem('lastUpdated', timestamp);
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

  // Save to localStorage and add class to body when theme changes
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.className = theme;
  }, [theme]);

  // Save collapse states to localStorage

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

  const closeSidebarSettings = () => {
    setShowSidebarSettings(false);
  };

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


  const LONGTERM_COLORS = ['#667eea', '#f093fb', '#4ade80', '#60a5fa', '#fb923c', '#facc15', '#9ca3af', '#34d399', '#f472b6', '#a78bfa'];
  const addTodo = (category, text, dueDate = null) => {
    pushHistory(todos);
    const autoColor = category === 'daily' ? '#f87171'
      : category === 'longterm' ? LONGTERM_COLORS[Math.floor(Math.random() * LONGTERM_COLORS.length)]
      : null;
    const newTodo = {
      id: Date.now(),
      text,
      category,
      completed: false,
      createdAt: Date.now(),
      dueDate,
      subtasks: [],
      order: -Date.now(),
      color: autoColor
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

    // Boundary check
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

  // Todo drag & drop — fitness tarzı closure, sıfır React render
  const todoPositionsRef = useRef({});
  const todoHoldTimerRef = useRef(null);

  const handleTodoDragStart = useCallback((e, todo) => {
    if (e.button !== 0) return;
    if (!e.target.closest('.cc-drag-handle')) return;
    const itemEl = e.target.closest('.cc-item');
    if (!itemEl) return;
    e.preventDefault();

    const rect = itemEl.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    pushHistory(todos);

    let ghost = null;
    let dragOverEl = null;
    let overCategory = null;
    let overTodoId = null;

    function onMove(ev) {
      // Ghost oluştur (ilk harekette)
      if (!ghost) {
        ghost = document.createElement('div');
        ghost.textContent = todo.text;
        ghost.style.cssText = `
          position:fixed;z-index:9999;pointer-events:none;
          max-width:${rect.width}px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          background:#1a2d44;border:1.5px solid #58a6ff88;
          color:#c9d1d9;font-size:13px;font-weight:500;
          padding:6px 14px;border-radius:20px;
          transform:rotate(-1deg);
          box-shadow:0 4px 16px rgba(88,166,255,0.2);
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        `;
        document.body.appendChild(ghost);
        itemEl.style.opacity = '0.35';
        itemEl.style.transform = 'scale(0.97)';
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      ghost.style.left = (ev.clientX - offX) + 'px';
      ghost.style.top  = (ev.clientY - offY) + 'px';

      // Kolon bul
      let foundCategory = null;
      document.querySelectorAll('.category-column-v2').forEach(col => {
        const r = col.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom)
          foundCategory = col.dataset.category;
      });
      overCategory = foundCategory;

      // Todo highlight
      let hoveredEl = null;
      let hoveredId = null;
      if (foundCategory) {
        const col = document.querySelector(`.category-column-v2[data-category="${foundCategory}"]`);
        if (col) {
          for (const el of col.querySelectorAll('.cc-item[data-todo-id]')) {
            const id = el.getAttribute('data-todo-id');
            if (id === String(todo.id)) continue;
            const r = el.getBoundingClientRect();
            if (ev.clientY >= r.top && ev.clientY <= r.bottom) { hoveredEl = el; hoveredId = id; break; }
          }
        }
      }
      overTodoId = hoveredId;
      if (hoveredEl !== dragOverEl) {
        if (dragOverEl) dragOverEl.classList.remove('cc-drag-over');
        if (hoveredEl) hoveredEl.classList.add('cc-drag-over');
        dragOverEl = hoveredEl;
      }
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (ghost) { ghost.remove(); ghost = null; }
      if (dragOverEl) { dragOverEl.classList.remove('cc-drag-over'); dragOverEl = null; }
      itemEl.style.opacity = '';
      itemEl.style.transform = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (overTodoId) {
        const allEls = document.querySelectorAll('.cc-item[data-todo-id]');
        const oldPositions = {};
        allEls.forEach(el => { const id = el.getAttribute('data-todo-id'); if (id) oldPositions[id] = el.getBoundingClientRect(); });
        todoPositionsRef.current = oldPositions;
        playClickSound();
        setTodos(prev => {
          const dragItem   = prev.find(t => String(t.id) === String(todo.id));
          const targetItem = prev.find(t => String(t.id) === String(overTodoId));
          if (!dragItem || !targetItem) return prev;
          const category = targetItem.category;
          const catTodos  = [...prev].filter(t => t.category === category).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          const fromIdx = catTodos.findIndex(t => String(t.id) === String(todo.id));
          const toIdx   = catTodos.findIndex(t => String(t.id) === String(overTodoId));
          const reordered = [...catTodos];
          const [moved] = reordered.splice(fromIdx !== -1 ? fromIdx : reordered.length, 1);
          reordered.splice(toIdx, 0, moved || { ...dragItem });
          const updated = reordered.map((t, i) => ({ ...t, order: i, category }));
          const others  = prev.filter(t => t.category !== category && String(t.id) !== String(todo.id));
          return [...updated, ...others];
        });
      } else if (overCategory && overCategory !== todo.category) {
        playClickSound();
        setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, category: overCategory } : t));
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [todos]);


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
    setCategoryNames(prev => {
      const next = { ...prev, [category]: newName };
      localStorage.setItem('categoryNames', JSON.stringify(next));
      return next;
    });
  };


  // Export: Download all data as a JSON file
  const exportData = async () => {
    try {
      const get = (key, fallback) => localStorage.getItem(key) || fallback;
      const data = {
        version: '5.0',
        exportDate: new Date().toISOString(),
        // Core data
        todos: todos,
        notes: get('notes', '[]'),
        flashCards: get('flashCards', '[]'),
        flashCardGroups: get('flashCardGroups', '[]'),
        goals: get('goals', '[]'),
        invoices: get('invoices', '[]'),
        quickNotes: get('quickNotes', '[]'),
        // Checklists
        dailyChecklistItems: get('dailyChecklistItems', '[]'),
        dailyChecklistLastReset: get('dailyChecklistLastReset', ''),
        dailyChecklistColor: get('dailyChecklistColor', ''),
        longtermChecklistItems: get('longtermChecklistItems', '[]'),
        longtermChecklistLastReset: get('longtermChecklistLastReset', ''),
        longtermChecklistColor: get('longtermChecklistColor', ''),
        // References
        refImages: get('refImages', '[]'),
        refTexts: get('refTexts', '[]'),
        // User data
        streakData: get('streakData', '{}'),
        studyReminders: get('studyReminders', '[]'),
        loginHeatmap: get('loginHeatmap', '{}'),
        // Settings
        categoryNames: get('categoryNames', '{}'),
        checklistNames: get('checklistNames', '{}'),
        sidebarOrder: get('sidebarOrder', '[]'),
        theme: get('theme', 'dark'),
      };

      const dataStr = JSON.stringify(data, null, 2);
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const date = new Date().toISOString().split('T')[0];
      const filePath = await save({
        defaultPath: `bankospace-backup-${date}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
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

  // Import: Load data from a JSON file
  const importData = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (!filePath) return;

      const fileContent = await readTextFile(filePath);
      const data = JSON.parse(fileContent);

      // Core data
      if (data.todos) {
        setTodos(data.todos);
        localStorage.setItem('todos', JSON.stringify(data.todos));
      }
      const setRaw = (key, val) => { if (val !== undefined && val !== null) localStorage.setItem(key, val); };
      const setJSON = (key, val) => { if (val !== undefined && val !== null) localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); };

      setJSON('notes', data.notes);
      setJSON('flashCards', data.flashCards);
      setJSON('flashCardGroups', data.flashCardGroups);
      setJSON('goals', data.goals);
      setJSON('invoices', data.invoices);
      setJSON('quickNotes', data.quickNotes);
      setJSON('dailyChecklistItems', data.dailyChecklistItems);
      setRaw('dailyChecklistLastReset', data.dailyChecklistLastReset);
      setRaw('dailyChecklistColor', data.dailyChecklistColor);
      setJSON('longtermChecklistItems', data.longtermChecklistItems);
      setRaw('longtermChecklistLastReset', data.longtermChecklistLastReset);
      setRaw('longtermChecklistColor', data.longtermChecklistColor);
      setJSON('refImages', data.refImages);
      setJSON('refTexts', data.refTexts);
      setJSON('streakData', data.streakData);
      setJSON('studyReminders', data.studyReminders);
      setJSON('loginHeatmap', data.loginHeatmap);
      setJSON('categoryNames', data.categoryNames);
      setJSON('checklistNames', data.checklistNames);
      setJSON('sidebarOrder', data.sidebarOrder);
      if (data.theme) setRaw('theme', data.theme);

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
      >
        <div className="titlebar-left">
          <button className="titlebar-nav-btn" onClick={() => { playClickSound(); setShowSidebarSettings(s => !s); setSettingsTab('appearance'); }} title="Settings">
            ⚙
          </button>
        </div>
        {activeView === 'dashboard' && (
          <div className="titlebar-filters">
            <div className="titlebar-filters-left">
              <div className="font-size-control" style={{ position: 'relative' }}>
                <button
                  className="dashboard-timer-toggle-btn font-size-trigger"
                  onClick={() => setFontSizeOpen(o => !o)}
                  title="Font size"
                >Font</button>
                {fontSizeOpen && (
                  <div className="font-size-dropdown">
                    <div style={{fontSize:'10px',color:'#7d8590',padding:'4px 8px 2px',borderBottom:'1px solid #30363d',marginBottom:'2px'}}>Title</div>
                    {['S', 'M', 'L', 'XL'].map(s => (
                      <button
                        key={s}
                        className={`font-size-option ${todoFontSize === s ? 'active' : ''}`}
                        onClick={() => { setTodoFontSize(s); localStorage.setItem('todoFontSize', s); setFontSizeOpen(false); }}
                      >{s}</button>
                    ))}
                    <div style={{fontSize:'10px',color:'#7d8590',padding:'6px 8px 2px',borderTop:'1px solid #30363d',borderBottom:'1px solid #30363d',margin:'2px 0'}}>Subtask</div>
                    {['S', 'M', 'L', 'XL'].map(s => (
                      <button
                        key={'sub-'+s}
                        className={`font-size-option ${subtaskFontSize === s ? 'active' : ''}`}
                        onClick={() => { setSubtaskFontSize(s); localStorage.setItem('subtaskFontSize', s); setFontSizeOpen(false); }}
                      >{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <button
                ref={timerBtnRef}
                className="dashboard-timer-toggle-btn"
                onClick={async () => {
                  playClickSound();
                  const { invoke } = await import('@tauri-apps/api/core');
                  await invoke('toggle_timer_window');
                }}
                title="Timer"
              >
                Timer
              </button>
              <button
                className="dashboard-timer-toggle-btn"
                onClick={() => { playClickSound(); setShowSubPopup(s => !s); }}
                title="Subscriptions & Payments"
              >
                Payments
              </button>
            </div>
          </div>
        )}
        <div className="titlebar-drag-region" data-tauri-drag-region onDoubleClick={maximizeWindow} />
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

      {/* Auto-update notification */}
      {updateAvailable && (
        <div className="update-banner">
          <span>🚀 New version available: <strong>v{updateAvailable.version}</strong></span>
          <button
            className="update-install-btn"
            onClick={installUpdate}
            disabled={isUpdating}
          >
            {isUpdating ? 'Installing...' : 'Install & Restart'}
          </button>
          <button className="update-dismiss-btn" onClick={() => setUpdateAvailable(null)}>✕</button>
        </div>
      )}

      <div className="content-wrapper">
        {/* Left Sidebar - Notion Style */}
        <div className={`notion-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Sidebar Header */}
          <div className="sidebar-header">
            <div className="sidebar-title">
              {!sidebarCollapsed && <span>BankoSpace</span>}
            </div>
            <div className="sidebar-header-actions">
              <button
                className="sidebar-toggle"
                onClick={() => { setSidebarCollapsed(c => !c); setColWidths([null, null, null]); }}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
            </div>
          </div>
          {!sidebarCollapsed && session?.user?.email && (
            <div className="sidebar-profile-bar" onClick={() => { setShowSidebarSettings(true); setSettingsTab('account'); }}>
              <div className="sidebar-profile-avatar">
                {session.user.email[0].toUpperCase()}
              </div>
              <div className="sidebar-profile-info">
                <span className="sidebar-profile-name">{session.user.email.split('@')[0]}</span>
                <span className="sidebar-profile-email">{session.user.email}</span>
              </div>
              <span className="sidebar-profile-gear">⚙</span>
            </div>
          )}

          {/* Settings Modal - Notion Style */}
          {showSidebarSettings && (
            <div className="settings-modal-overlay" onClick={closeSidebarSettings}>
              <div className="settings-modal" onClick={e => e.stopPropagation()}>
                {/* Left nav */}
                <div className="settings-modal-nav">
                  <div className="settings-modal-nav-section">
                    <div className="settings-modal-nav-label">Account</div>
                    <button className={`settings-modal-nav-item ${settingsTab === 'account' ? 'active' : ''}`} onClick={() => setSettingsTab('account')}>
                      <span className="settings-nav-icon">👤</span> Profile
                    </button>
                    <button className={`settings-modal-nav-item ${settingsTab === 'ai' ? 'active' : ''}`} onClick={() => setSettingsTab('ai')}>
                      <span className="settings-nav-icon">🤖</span> AI
                    </button>
                    <button className={`settings-modal-nav-item ${settingsTab === 'sync' ? 'active' : ''}`} onClick={() => setSettingsTab('sync')}>
                      <span className="settings-nav-icon">☁</span> Cloud Sync
                    </button>
                  </div>
                  <div className="settings-modal-nav-section">
                    <div className="settings-modal-nav-label">App</div>
                    <button className={`settings-modal-nav-item ${settingsTab === 'appearance' ? 'active' : ''}`} onClick={() => setSettingsTab('appearance')}>
                      <span className="settings-nav-icon">◑</span> Appearance
                    </button>
                    <button className={`settings-modal-nav-item ${settingsTab === 'sound' ? 'active' : ''}`} onClick={() => setSettingsTab('sound')}>
                      <span className="settings-nav-icon">🔊</span> Sound
                    </button>
                    <button className={`settings-modal-nav-item ${settingsTab === 'pages' ? 'active' : ''}`} onClick={() => setSettingsTab('pages')}>
                      <span className="settings-nav-icon">📄</span> Pages
                    </button>
                    <button className={`settings-modal-nav-item ${settingsTab === 'data' ? 'active' : ''}`} onClick={() => setSettingsTab('data')}>
                      <span className="settings-nav-icon">💾</span> Data
                    </button>
                  </div>
                  <div className="settings-modal-nav-version">BankoSpace v{APP_VERSION}</div>
                </div>

                {/* Right content */}
                <div className="settings-modal-content">
                  <button className="settings-modal-close" onClick={closeSidebarSettings}>✕</button>

                  {settingsTab === 'account' && (
                    <div className="settings-modal-section">
                      <h2 className="settings-modal-title">Profile</h2>
                      {session ? (
                        <>
                          <div className="settings-row-card">
                            <div className="settings-row-info">
                              <div className="settings-row-avatar">{session.user?.email?.[0]?.toUpperCase()}</div>
                              <div>
                                <div className="settings-row-name">{session.user?.email}</div>
                                <div className="settings-row-sub">Active session</div>
                              </div>
                            </div>
                            <button
                              className="settings-action-btn danger"
                              onClick={async () => { await supabase.auth.signOut(); if (onLogout) onLogout(); }}
                            >Sign Out</button>
                          </div>
                        </>
                      ) : (
                        <div className="settings-empty-state">Not signed in</div>
                      )}
                    </div>
                  )}

                  {settingsTab === 'ai' && (
                    <div className="settings-modal-section">
                      <h2 className="settings-modal-title">AI</h2>
                      <div className="settings-field">
                        <label className="settings-field-label">Anthropic API Key</label>
                        <div className="settings-field-desc">Enter your API key to use Claude AI features</div>
                        <input
                          type="password"
                          className="settings-field-input"
                          defaultValue={localStorage.getItem('anthropic_api_key') || ''}
                          placeholder="sk-ant-..."
                          onBlur={e => {
                            const val = e.target.value.trim();
                            if (val) {
                              localStorage.setItem('anthropic_api_key', val);
                              pushKeyToSupabase('anthropic_api_key', val);
                            } else {
                              localStorage.removeItem('anthropic_api_key');
                              pushKeyToSupabase('anthropic_api_key', null);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {settingsTab === 'sync' && (
                    <div className="settings-modal-section">
                      <h2 className="settings-modal-title">Cloud Sync</h2>
                      <div className="settings-row-inline">
                        <div>
                          <div className="settings-row-name">Supabase Sync</div>
                          <div className="settings-row-sub">Store your data in the cloud and sync across devices</div>
                        </div>
                        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                          <span className={`settings-sync-badge ${localStorage.getItem('supabase_sync_enabled')==='1' ? 'on' : 'off'}`}>
                            {localStorage.getItem('supabase_sync_enabled')==='1' ? 'Active' : 'Off'}
                          </span>
                          <button
                            className="settings-action-btn"
                            onClick={() => {
                              const isOn = localStorage.getItem('supabase_sync_enabled') === '1';
                              if (isOn) localStorage.removeItem('supabase_sync_enabled');
                              else localStorage.setItem('supabase_sync_enabled', '1');
                              window.location.reload();
                            }}
                          >{localStorage.getItem('supabase_sync_enabled')==='1' ? 'Disable' : 'Enable'}</button>
                          {localStorage.getItem('supabase_sync_enabled')==='1' && (
                            <button
                              className="settings-action-btn"
                              onClick={async () => { await pushAllToSupabase(); alert('All data uploaded!'); }}
                            >Sync Now</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === 'appearance' && (
                    <div className="settings-modal-section">
                      <h2 className="settings-modal-title">Appearance</h2>

                      <div className="settings-row-inline">
                        <div>
                          <div className="settings-row-name">Theme</div>
                          <div className="settings-row-sub">Light or dark mode</div>
                        </div>
                        <div className="settings-theme-toggle">
                          <button
                            className={`settings-theme-btn ${theme === 'light' ? 'active' : ''}`}
                            onClick={() => { if (theme !== 'light') toggleTheme(); }}
                          >Light</button>
                          <button
                            className={`settings-theme-btn ${theme === 'dark' ? 'active' : ''}`}
                            onClick={() => { if (theme !== 'dark') toggleTheme(); }}
                          >Dark</button>
                        </div>
                      </div>

                      <div className="settings-row-inline" style={{marginTop:'16px'}}>
                        <div>
                          <div className="settings-row-name">Todo Font Size</div>
                          <div className="settings-row-sub">Task list text size</div>
                        </div>
                        <div className="settings-size-group">
                          {['S','M','L'].map(s => (
                            <button
                              key={s}
                              className={`settings-size-btn ${todoFontSize === s ? 'active' : ''}`}
                              onClick={() => { setTodoFontSize(s); localStorage.setItem('todoFontSize', s); }}
                            >{s}</button>
                          ))}
                        </div>
                      </div>

                      <div className="settings-row-inline" style={{marginTop:'16px'}}>
                        <div>
                          <div className="settings-row-name">Subtask Font Size</div>
                          <div className="settings-row-sub">Subtask text size</div>
                        </div>
                        <div className="settings-size-group">
                          {['S','M','L'].map(s => (
                            <button
                              key={s}
                              className={`settings-size-btn ${subtaskFontSize === s ? 'active' : ''}`}
                              onClick={() => { setSubtaskFontSize(s); localStorage.setItem('subtaskFontSize', s); }}
                            >{s}</button>
                          ))}
                        </div>
                      </div>

                      <div className="settings-row-inline" style={{marginTop:'16px'}}>
                        <div>
                          <div className="settings-row-name">Show Emoji</div>
                          <div className="settings-row-sub">Show emoji in task list</div>
                        </div>
                        <div
                          className={`settings-toggle ${useEmoji ? 'on' : ''}`}
                          onClick={() => { const v = !useEmoji; setUseEmoji(v); localStorage.setItem('useEmoji', String(v)); }}
                        >
                          <div className="settings-toggle-knob" />
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === 'sound' && (
                    <div className="settings-modal-section">
                      <h2 className="settings-modal-title">Ses</h2>
                      <div className="settings-row-inline">
                        <div>
                          <div className="settings-row-name">Ses Seviyesi</div>
                          <div className="settings-row-sub">Uygulama ses efektlerinin seviyesi</div>
                        </div>
                        <div className="settings-volume-right">
                          <button
                            className={`sidebar-mute-btn ${soundVolume === 0 ? 'muted' : ''}`}
                            onClick={() => {
                              if (soundVolume > 0) {
                                localStorage.setItem('soundVolumePrev', String(soundVolume));
                                setSoundVolume(0); setVolume(0);
                              } else {
                                const prev = parseFloat(localStorage.getItem('soundVolumePrev') || '0.7');
                                setSoundVolume(prev); setVolume(prev); playClickSound();
                              }
                            }}
                          >{soundVolume === 0 ? '🔇' : soundVolume < 0.4 ? '🔉' : '🔊'}</button>
                          <span className="sidebar-settings-value">{Math.round(soundVolume * 100)}%</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        className="sidebar-volume-slider"
                        style={{width:'100%',marginTop:'12px'}}
                        min="0" max="1" step="0.05"
                        value={soundVolume}
                        onChange={e => { const v = parseFloat(e.target.value); setSoundVolume(v); setVolume(v); }}
                        onMouseUp={() => playClickSound()}
                      />
                    </div>
                  )}

                  {settingsTab === 'pages' && (
                    <div className="settings-modal-section">
                      <h2 className="settings-modal-title">Sayfalar</h2>
                      <div className="settings-field-desc" style={{marginBottom:'16px'}}>Select pages to show in the sidebar</div>
                      {sidebarItems.filter(item => item.id !== 'dashboard').map(item => (
                        <div key={item.id} className="settings-page-row" onClick={() => togglePageVisibility(item.id)}>
                          <div>
                            <div className="settings-row-name">{item.label}</div>
                          </div>
                          <div className={`settings-toggle ${item.hidden ? '' : 'on'}`}>
                            <div className="settings-toggle-knob" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {settingsTab === 'data' && (
                    <div className="settings-modal-section">
                      <h2 className="settings-modal-title">Veri</h2>
                      <div className="settings-data-row">
                        <div>
                          <div className="settings-row-name">Export Data</div>
                          <div className="settings-row-sub">Download all your data as a JSON file</div>
                        </div>
                        <button className="settings-action-btn" onClick={() => { exportData(); closeSidebarSettings(); }}>Export</button>
                      </div>
                      <div className="settings-data-row">
                        <div>
                          <div className="settings-row-name">Import Data</div>
                          <div className="settings-row-sub">Load your data from a JSON file</div>
                        </div>
                        <button className="settings-action-btn" onClick={() => { importData(); closeSidebarSettings(); }}>Import</button>
                      </div>
                      <div className="settings-data-row danger-row">
                        <div>
                          <div className="settings-row-name" style={{color:'#f85149'}}>Reset All Data</div>
                          <div className="settings-row-sub">This action cannot be undone</div>
                        </div>
                        <button className="settings-action-btn danger" onClick={() => { resetAllData(); closeSidebarSettings(); }}>Reset</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Timer — always mounted so it doesn't reset on collapse */}
          <div className="sidebar-timer-widget" style={{ display: sidebarCollapsed ? 'none' : undefined }}>
            <Timer isCompact={true} />
          </div>

          {!sidebarCollapsed && (
            <div className="sidebar-content">
              {/* Draggable Sidebar Items */}
              {sidebarItems.filter(item => !item.hidden).map((item, index) => (
                <div
                  key={item.id}
                  data-sidebar-id={item.id}
                  className={`sidebar-item ${item.id === 'dashboard' ? 'main-item' : ''} ${activeView === item.view ? 'active' : ''} ${draggedSidebarItem?.item.id === item.id ? 'sidebar-dragging' : ''}`}
                  onMouseDown={(e) => handleSidebarDragStart(e, item, index)}
                  onClick={() => {
                    if (draggedSidebarItem) return;
                    playNavSound();
                    if (item.id === 'japanesekana') {
                      setActiveView('japanesekana');
                      return;
                    }
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

          {/* Fitness Tracker */}
          {activeView === 'fitness' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <FitnessTracker />
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

          {/* Tools View: Project Bid + Translate */}
          {activeView === 'tools' && (
            <ToolsView />
          )}

          {/* Japanese Kana full page */}
          {activeView === 'japanesekana' && (
            <JapaneseKana />
          )}


          {/* Dashboard View */}
          {activeView === 'dashboard' && (
          <div className="dashboard-container" style={{ '--todo-font-size': fontSizeMap[todoFontSize], '--subtask-font-size': subtaskFontSizeMap[subtaskFontSize] }}>
            {/* Todo Columns - resizable */}
            <div className="todo-columns" ref={columnsRef}>
              <div className="todo-col-wrapper" style={colWidths[0] ? { flex: `1 1 ${colWidths[0]}px`, minWidth: 0 } : { flex: 1, minWidth: 0 }}>
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
                />
              </div>
              <div className="col-resize-handle" onMouseDown={e => startColResize(0, e)} onDoubleClick={() => { setColWidths(DEFAULT_COL_PX); localStorage.setItem('dashColWidths', JSON.stringify(DEFAULT_COL_PX)); }} />
              <div className="todo-col-wrapper" style={colWidths[1] ? { flex: `1 1 ${colWidths[1]}px`, minWidth: 0 } : { flex: 1, minWidth: 0 }}>
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
                />
              </div>
              <div className="col-resize-handle" onMouseDown={e => startColResize(1, e)} onDoubleClick={() => { setColWidths(DEFAULT_COL_PX); localStorage.setItem('dashColWidths', JSON.stringify(DEFAULT_COL_PX)); }} />
              <div className="todo-col-wrapper" style={colWidths[2] ? { flex: `1 1 ${colWidths[2]}px`, minWidth: 0 } : { flex: 1, minWidth: 0 }}>
                <DashRightCol />
              </div>
            </div>
          </div>
          )}
        </div>
      </div>



      {/* Subscriptions & Payments Popup */}
      {showSubPopup && <SubscriptionPopup onClose={() => setShowSubPopup(false)} />}

      {/* Timer Widget Overlay */}
      {timerWidgetOpen && (
        <div className="timer-widget-overlay" style={{ top: timerWidgetPos.top, left: timerWidgetPos.left }}>
          <div className={`timer-widget-panel ${timerWidgetCompact ? 'compact' : 'large'}`}>
            <div className="timer-widget-header" onMouseDown={handleTimerDragStart} style={{ cursor: 'grab' }}>
              <span className="timer-widget-title">⏱ Timer</span>
              <div className="timer-widget-actions">
                <button
                  className="timer-widget-size-btn"
                  onClick={() => setTimerWidgetCompact(p => !p)}
                  title={timerWidgetCompact ? 'Expand' : 'Compact'}
                >{timerWidgetCompact ? '⤢' : '⤡'}</button>
                <button
                  className="timer-widget-close-btn"
                  onClick={() => { playClickSound(); setTimerWidgetOpen(false); }}
                  title="Close"
                >×</button>
              </div>
            </div>
            <div className="timer-widget-body">
              <Timer isPopup={true} isCompact={timerWidgetCompact} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Timer Popup Wrapper Component
function TimerPopupWrapper({ isCompact: initialCompact = false }) {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [compact, setCompact] = useState(initialCompact);
  const [settingMode, setSettingMode] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await getCurrentWindow().setAlwaysOnTop(true);
      } catch (err) {}
    };
    init();
  }, []);

  useEffect(() => {
    const resize = async () => {
      try {
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        if (compact) {
          const h = settingMode ? 116 : 64;
          await getCurrentWindow().setSize(new LogicalSize(260, h));
        } else {
          await getCurrentWindow().setSize(new LogicalSize(260, 310));
        }
      } catch (err) {}
    };
    resize();
  }, [compact, settingMode]);

  const toggleAlwaysOnTop = async () => {
    try {
      const newValue = !isAlwaysOnTop;
      await getCurrentWindow().setAlwaysOnTop(newValue);
      setIsAlwaysOnTop(newValue);
    } catch (err) {}
  };

  const closePopup = async () => {
    try {
      await getCurrentWindow().close();
    } catch (err) {}
  };

  if (compact) {
    return (
      <div className="timer-mini-popup-container">
        <div className="timer-mini-popup-header">
          <span className="timer-mini-popup-title">⏱</span>
          <div className="timer-mini-popup-actions">
            <button
              className="timer-mini-size-btn"
              onClick={() => setCompact(false)}
              title="Expand"
            >⤢</button>
            <button
              className={`timer-mini-pin-btn ${isAlwaysOnTop ? 'active' : ''}`}
              onClick={toggleAlwaysOnTop}
              title={isAlwaysOnTop ? 'Unpin' : 'Pin'}
            >📌</button>
            <button className="timer-mini-close-btn" onClick={closePopup}>×</button>
          </div>
        </div>
        <Timer isPopup={true} isCompact={true} onSettingChange={setSettingMode} />
      </div>
    );
  }

  return (
    <div className="timer-popup-container">
      <div className="timer-popup-header" onMouseDown={async () => { const { getCurrentWindow } = await import('@tauri-apps/api/window'); getCurrentWindow().startDragging(); }}>
        <span className="timer-popup-header-title">⏱ Timer</span>
        <div className="timer-popup-header-actions">
          <button
            className="timer-popup-size-btn"
            onClick={() => setCompact(true)}
            title="Compact"
          >⤡</button>
          <button
            className={`timer-popup-pin-btn ${isAlwaysOnTop ? 'active' : ''}`}
            onClick={toggleAlwaysOnTop}
            title={isAlwaysOnTop ? 'Unpin' : 'Pin'}
          >📌</button>
          <button className="timer-popup-close-btn" onClick={closePopup} title="Close">×</button>
        </div>
      </div>
      <div className="timer-popup-body">
        <Timer isPopup={true} />
      </div>
    </div>
  );
}



function DashRightCol() {
  const [topPct, setTopPct] = useState(() => {
    const saved = localStorage.getItem('dashRightSplit');
    return saved ? Number(saved) : 60;
  });
  const dragging = useRef(false);
  const containerRef = useRef(null);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (e) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(85, Math.max(15, ((e.clientY - rect.top) / rect.height) * 100));
      setTopPct(pct);
      localStorage.setItem('dashRightSplit', String(pct));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="dash-right-col" ref={containerRef}>
      <div className="dash-right-top" style={{ flex: `0 0 ${topPct}%` }}>
        <SubscriptionTracker />
      </div>
      <div className="dash-right-resize-handle" onMouseDown={onMouseDown} />
      <div className="dash-right-bottom" style={{ flex: 1 }}>
        <QuickLaunchPanel />
      </div>
    </div>
  );
}

function ToolsView() {
  return <ToolsChat />;
}

function AppWrapper() {
  // loggedIn: null=loading, false=logged out, true=logged in
  const [loggedIn, setLoggedIn] = useState(null);
  const [initialSession, setInitialSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setInitialSession(session);
      setLoggedIn(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setLoggedIn(false);
      } else if (event === 'SIGNED_IN' && session) {
        setInitialSession(session);
        setLoggedIn(true);
      }
      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION etc. are intentionally ignored
      // to prevent re-renders that break the layout
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loggedIn === null) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#7d8590', fontSize: '14px' }}>Loading...</div>
      </div>
    );
  }

  if (!loggedIn) {
    return <Login
      onLogin={(s) => { setInitialSession(s); setLoggedIn(true); }}
    />;
  }

  return <App key="main-app" session={initialSession} onLogout={() => setLoggedIn(false)} />;
}

export default AppWrapper;
