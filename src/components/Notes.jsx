import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import './Notes.css';
import { playTypeSoundThrottled, playClickSound, playAddSound, playDeleteSound } from '../utils/sounds';
import { pushKeyToSupabase } from '../supabase';

function rgbToHex(rgb) {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
}

// ── Renk Paleti — tek yerden değiştir, her yere yansır ──
const COLOR_PRESETS = [
  { fg: '#c9d1d9', bg: null,      label: 'Default'   },
  { fg: '#ff6b6b', bg: null,      label: 'Red'       },
  { fg: '#74b9ff', bg: null,      label: 'Blue'      },
  { fg: '#55efc4', bg: null,      label: 'Green'     },
  { fg: '#a29bfe', bg: null,      label: 'Purple'    },
  { fg: '#fdcb6e', bg: null,      label: 'Orange'    },
  { fg: '#e2e8f0', bg: '#1e3a5f', label: 'Blue BG'   },
  { fg: '#e2e8f0', bg: '#14432a', label: 'Green BG'  },
  { fg: '#e2e8f0', bg: '#4a1515', label: 'Red BG'    },
  { fg: '#e2e8f0', bg: '#5c4700', label: 'Yellow BG' },
];

// Eski notlardaki renkleri güncel palete migrate et
function migrateNoteColors(notes) {
  // Eski → Yeni renk eşleştirme (geçmişte kullanılan tüm değerler)
  const FG_MAP = {
    '#f85149': '#ff6b6b', '#FF7369': '#ff6b6b',
    '#5c7cfa': '#74b9ff', '#529CCA': '#74b9ff',
    '#7ee787': '#55efc4', '#4DAB9A': '#55efc4',
    '#d2a8ff': '#a29bfe', '#9B8FD4': '#a29bfe',
    '#f0883e': '#fdcb6e', '#C98A4B': '#fdcb6e',
    '#ffffff': '#e2e8f0',
    '#000000': '#e2e8f0',
    '#c9d1d9': '#c9d1d9',
  };
  const BG_MAP = {
    '#1f6feb': '#1e3a5f', '#364954': '#1e3a5f',
    '#238636': '#14432a', '#354C4B': '#14432a',
    '#da3633': '#4a1515', '#594141': '#4a1515',
    '#e3b341': '#4a3800', '#59563B': '#4a3800',
  };

  const migrateHtml = html => {
    if (!html) return html;
    // fg: color style
    let out = html.replace(/color:\s*(#[0-9a-fA-F]{6})/g, (m, c) => {
      const key = c.toLowerCase();
      const mapped = Object.entries(FG_MAP).find(([k]) => k.toLowerCase() === key);
      return mapped ? `color: ${mapped[1]}` : m;
    });
    // bg: background-color style
    out = out.replace(/background-color:\s*(#[0-9a-fA-F]{6})/g, (m, c) => {
      const key = c.toLowerCase();
      const mapped = Object.entries(BG_MAP).find(([k]) => k.toLowerCase() === key);
      return mapped ? `background-color: ${mapped[1]}` : m;
    });
    return out;
  };

  return notes.map(note => ({
    ...note,
    pages: (note.pages || []).map(page => ({
      ...page,
      content: migrateHtml(page.content),
    })),
  }));
}

// Rich Text Editor Component
const RichTextEditor = forwardRef(({ content, placeholder, onChange, style }, ref) => {
  const editorRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(!content);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content || '';
      setIsEmpty(!content);
    }
  }, []);

  const handleInput = () => {
    playTypeSoundThrottled();
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const textContent = editorRef.current.textContent;
      setIsEmpty(!textContent || textContent.trim() === '');
      onChange(html);
    }
  };

  return (
    <div
      ref={(el) => {
        editorRef.current = el;
        if (ref) ref.current = el;
      }}
      className={`notebook-page-editor ${isEmpty ? 'empty' : ''}`}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      data-placeholder={placeholder}
      style={style}
    />
  );
});

function Notes() {
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('notes');
    const backup = localStorage.getItem('notes_local_backup');
    const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
    const a = parse(saved), b = parse(backup);
    const raw = (a && b) ? (a.length >= b.length ? a : b) : (a || b || []);
    return migrateNoteColors(raw);
  });
  const [currentNote, setCurrentNote] = useState(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedColor, setExpandedColor] = useState(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('notesSidebarWidth');
    return saved ? parseInt(saved) : 300;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('notesSidebarCollapsed') === 'true';
  });
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, type: null, id: null });
  const [activeFormats, setActiveFormats] = useState({});
  const [showColorPresets, setShowColorPresets] = useState(false);
  const [showNotesMenu, setShowNotesMenu] = useState(false);
  const [colorShortcuts, setColorShortcuts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notes_color_shortcuts') || '{}'); } catch { return {}; }
  });
  const [hoveredPresetIdx, setHoveredPresetIdx] = useState(null);
  const [shortcutToast, setShortcutToast] = useState(null); // { key, label }
  const [lineSpacing, setLineSpacing] = useState(() => {
    const saved = localStorage.getItem('notesLineSpacing');
    const v = saved ? parseFloat(saved) : 1.7;
    return Math.round(v * 10) / 10;
  });
  const [draggedNote, setDraggedNote] = useState(null);
  const [dragOverNoteId, setDragOverNoteId] = useState(null);
  const noteDragPosRef = useRef({ x: 0, y: 0 });
  const noteDragOffsetRef = useRef({ x: 0, y: 0 });
  const noteGhostRef = useRef(null);
  const notePositionsRef = useRef({});
  const dragOverNoteRef = useRef(null);
  const editorLeftRef = useRef(null);
  const editorRightRef = useRef(null);
  const sidebarRef = useRef(null);
  const savedSelectionRef = useRef(null);

  // Save current selection
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  // Restore saved selection
  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  };

  // Text formatting functions
  const execFormat = (command, value = null) => {
    playClickSound();
    document.execCommand(command, false, value);
    updateActiveFormats();
  };

  // Apply exact px font size using execCommand fontSize workaround
  const applyFontSize = (px) => {
    playClickSound();
    document.execCommand('fontSize', false, '7');
    const editor = editorLeftRef.current || editorRightRef.current;
    if (editor) {
      editor.querySelectorAll('font[size="7"]').forEach(el => {
        el.removeAttribute('size');
        el.style.fontSize = px + 'px';
      });
    }
    updateActiveFormats();
  };

  // Apply color with selection restore
  const applyColor = (command, value) => {
    restoreSelection();
    document.execCommand(command, false, value);
    updateActiveFormats();
  };

  const getSelectionFontSize = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (!node) return null;
    const size = window.getComputedStyle(node).fontSize;
    return size ? Math.round(parseFloat(size)) : null;
  };

  const updateActiveFormats = () => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      justifyLeft: document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      fontSize: getSelectionFontSize(),
    });
  };

  const handleSelectionChange = useCallback(() => {
    updateActiveFormats();
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  // Sidebar resize handlers — ref-based for smooth, jank-free dragging
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const isResizingRef = useRef(false);

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarRef.current
      ? sidebarRef.current.getBoundingClientRect().width
      : sidebarWidth;
    isResizingRef.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      if (!isResizingRef.current) return;
      const delta = ev.clientX - resizeStartXRef.current;
      const newWidth = Math.min(Math.max(200, resizeStartWidthRef.current + delta), 500);
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
      }
    }

    function onUp(ev) {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const delta = ev.clientX - resizeStartXRef.current;
      const newWidth = Math.min(Math.max(200, resizeStartWidthRef.current + delta), 500);
      setSidebarWidth(newWidth);
      localStorage.setItem('notesSidebarWidth', newWidth.toString());
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  useEffect(() => {
    if (notes.length === 0) return; // boş listeyle üstüne yazma
    const serialized = JSON.stringify(notes);
    localStorage.setItem('notes', serialized);
    // Yerel yedek — Supabase sync bozulsa bile korunur
    localStorage.setItem('notes_local_backup', serialized);
    pushKeyToSupabase('notes', serialized);
  }, [notes]);

  // Create new note directly without modal
  const createNewNote = () => {
    const newNote = {
      id: Date.now(),
      title: 'New Note',
      pages: [
        { id: Date.now(), title: 'Page 1', content: '' },
        { id: Date.now() + 1, title: 'Page 2', content: '' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      color: '#667eea'
    };
    setNotes([newNote, ...notes]);
    setCurrentNote(newNote);
    setCurrentPageIndex(0);
    setEditingNoteTitle(newNote.id);
    playAddSound();
  };

  // Double-click to edit note title in sidebar
  const handleNoteDoubleClick = (noteId, e) => {
    e.stopPropagation();
    setEditingNoteTitle(noteId);
  };

  const handleNoteTitleChange = (noteId, newTitle) => {
    updateNote(noteId, { title: newTitle });
  };

  const handleNoteTitleBlur = () => {
    setEditingNoteTitle(null);
  };

  const handleNoteTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setEditingNoteTitle(null);
    }
  };

  const updateNote = (id, updates) => {
    const updatedNotes = notes.map(note =>
      note.id === id
        ? { ...note, ...updates, updatedAt: new Date().toISOString() }
        : note
    );
    setNotes(updatedNotes);
    if (currentNote?.id === id) {
      setCurrentNote(updatedNotes.find(n => n.id === id));
    }
  };

  const deleteNote = (id) => {
    setDeleteConfirm({ show: true, type: 'note', id });
  };

  const confirmDelete = () => {
    playDeleteSound();
    if (deleteConfirm.type === 'note') {
      setNotes(notes.filter(note => note.id !== deleteConfirm.id));
      if (currentNote?.id === deleteConfirm.id) {
        setCurrentNote(null);
        setCurrentPageIndex(0);
      }
    } else if (deleteConfirm.type === 'page') {
      const updatedPages = currentNote.pages.filter(p => p.id !== deleteConfirm.id);
      updateNote(currentNote.id, { pages: updatedPages });
      if (currentPageIndex >= updatedPages.length) {
        setCurrentPageIndex(updatedPages.length - 1);
      }
    }
    setDeleteConfirm({ show: false, type: null, id: null });
  };

  const cancelDelete = () => {
    setDeleteConfirm({ show: false, type: null, id: null });
  };

  // Add a new spread (2 pages)
  const addSpread = () => {
    if (!currentNote) return;
    const pageCount = currentNote.pages.length;
    const newPages = [
      { id: Date.now(), title: `Page ${pageCount + 1}`, content: '' },
      { id: Date.now() + 1, title: `Page ${pageCount + 2}`, content: '' }
    ];
    const updatedPages = [...currentNote.pages, ...newPages];
    updateNote(currentNote.id, { pages: updatedPages });
    setCurrentPageIndex(Math.floor(pageCount / 2));
  };

  // Get current spread index (each spread has 2 pages)
  const currentSpreadIndex = currentPageIndex;
  const totalSpreads = currentNote ? Math.ceil(currentNote.pages.length / 2) : 0;

  // Get pages for current spread
  const getSpreadPages = () => {
    if (!currentNote) return [null, null];
    const leftIndex = currentSpreadIndex * 2;
    const rightIndex = leftIndex + 1;
    return [
      currentNote.pages[leftIndex] || null,
      currentNote.pages[rightIndex] || null
    ];
  };

  const [leftPage, rightPage] = currentNote ? getSpreadPages() : [null, null];

  const deletePage = (pageId) => {
    if (!currentNote || currentNote.pages.length <= 1) return;
    setDeleteConfirm({ show: true, type: 'page', id: pageId });
  };

  const updatePage = (pageId, updates) => {
    if (!currentNote) return;
    const updatedPages = currentNote.pages.map(page =>
      page.id === pageId ? { ...page, ...updates } : page
    );
    updateNote(currentNote.id, { pages: updatedPages });
  };

  const exportAllNotes = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const date = new Date().toISOString().slice(0, 10);
      const filePath = await save({
        defaultPath: `notlar-${date}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) await writeTextFile(filePath, JSON.stringify(notes, null, 2));
    } catch (e) {
      console.error('Export error:', e);
    }
  };

  const importNotes = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const filePath = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;
      const text = await readTextFile(filePath);
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) { alert('Geçersiz dosya'); return; }
      setNotes(imported);
    } catch (e) {
      console.error('Import error:', e);
      alert('Dosya okunamadı');
    }
  };

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.pages?.some(p => p.content?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Custom Drag & Drop with mouse events - ref-based for smooth performance
  const handleNoteDragStart = useCallback((e, note, index) => {
    if (e.button !== 0) return;
    if (editingNoteTitle === note.id) return;
    if (e.target.tagName === 'INPUT' || e.target.closest('.note-color-dot') || e.target.closest('.note-item-delete')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    noteDragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    noteDragPosRef.current = { x: e.clientX, y: e.clientY };
    setDraggedNote({ note, index, width: rect.width, height: rect.height });

    requestAnimationFrame(() => {
      if (noteGhostRef.current) {
        noteGhostRef.current.style.left = `${e.clientX - noteDragOffsetRef.current.x}px`;
        noteGhostRef.current.style.top = `${e.clientY - noteDragOffsetRef.current.y}px`;
      }
    });
    e.preventDefault();
  }, [editingNoteTitle]);

  const handleNoteDragMove = useCallback((e) => {
    if (!draggedNote) return;

    // Move ghost directly via ref
    if (noteGhostRef.current) {
      noteGhostRef.current.style.left = `${e.clientX - noteDragOffsetRef.current.x}px`;
      noteGhostRef.current.style.top = `${e.clientY - noteDragOffsetRef.current.y}px`;
    }

    // Find which note the cursor is hovering over
    const noteElements = document.querySelectorAll('.note-item:not(.note-drag-ghost)');
    let hoveredId = null;

    for (const el of noteElements) {
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const targetId = el.getAttribute('data-note-id');
        if (targetId && String(targetId) !== String(draggedNote.note.id)) {
          hoveredId = targetId;
        }
        break;
      }
    }

    dragOverNoteRef.current = hoveredId;
    setDragOverNoteId(hoveredId);
  }, [draggedNote]);

  const handleNoteDragEnd = useCallback(() => {
    const overNoteId = dragOverNoteRef.current;

    if (draggedNote && overNoteId) {
      // Capture old positions for FLIP animation
      const noteElements = document.querySelectorAll('.note-item:not(.note-drag-ghost)');
      const oldPositions = {};
      noteElements.forEach(item => {
        const id = item.getAttribute('data-note-id');
        if (id) oldPositions[id] = item.getBoundingClientRect();
      });
      notePositionsRef.current = oldPositions;

      // Swap the two notes
      playClickSound();
      setNotes(prev => {
        const dragIdx = prev.findIndex(n => String(n.id) === String(draggedNote.note.id));
        const targetIdx = prev.findIndex(n => String(n.id) === String(overNoteId));
        if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return prev;
        const newNotes = [...prev];
        [newNotes[dragIdx], newNotes[targetIdx]] = [newNotes[targetIdx], newNotes[dragIdx]];
        return newNotes;
      });
    }

    setDraggedNote(null);
    setDragOverNoteId(null);
    dragOverNoteRef.current = null;
  }, [draggedNote]);

  useEffect(() => {
    if (draggedNote) {
      document.addEventListener('mousemove', handleNoteDragMove);
      document.addEventListener('mouseup', handleNoteDragEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleNoteDragMove);
        document.removeEventListener('mouseup', handleNoteDragEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [draggedNote, handleNoteDragMove, handleNoteDragEnd]);

  // FLIP animation for smooth reordering
  useEffect(() => {
    const oldPositions = notePositionsRef.current;
    if (Object.keys(oldPositions).length === 0) return;

    const noteElements = document.querySelectorAll('.note-item:not(.note-drag-ghost)');
    noteElements.forEach((el) => {
      const noteId = el.getAttribute('data-note-id');
      if (!noteId || !oldPositions[noteId]) return;
      const newRect = el.getBoundingClientRect();
      const deltaY = oldPositions[noteId].top - newRect.top;
      if (Math.abs(deltaY) > 1) {
        el.style.transform = `translateY(${deltaY}px)`;
        el.style.transition = 'none';
        el.offsetHeight;
        el.style.transform = '';
        el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
      }
    });
    notePositionsRef.current = {};
  }, [notes]);

  const colors = [
    '#667eea', '#f093fb', '#4ade80', '#60a5fa',
    '#fb923c', '#f87171', '#5c7cfa', '#9ca3af'
  ];

  useEffect(() => {
    if (!showNotesMenu) return;
    const close = () => setShowNotesMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showNotesMenu]);

  const applyPreset = useCallback((preset, useRestore = false) => {
    // useRestore=true: toolbar tıklaması (selection kaybolmuş), false: kısayol (selection hâlâ aktif)
    if (useRestore) restoreSelection();

    const sel = window.getSelection();
    const node = sel?.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel?.anchorNode;
    const computed = node ? window.getComputedStyle(node) : null;
    const curFg = computed?.color ? rgbToHex(computed.color) : null;
    const curBg = computed?.backgroundColor ? rgbToHex(computed.backgroundColor) : null;
    const sameFg = curFg && curFg.toLowerCase() === preset.fg.toLowerCase();
    const sameBg = preset.bg
      ? (curBg && curBg.toLowerCase() === preset.bg.toLowerCase())
      : (!curBg || curBg === '#000000' || curBg === 'transparent');
    const shouldClear = sameFg && sameBg;

    if (shouldClear) {
      document.execCommand('foreColor', false, '#c9d1d9');
      document.execCommand('hiliteColor', false, 'transparent');
    } else {
      document.execCommand('foreColor', false, preset.fg);
      document.execCommand('hiliteColor', false, preset.bg || 'transparent');
    }
    window.getSelection()?.removeAllRanges();
    updateActiveFormats();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      const num = parseInt(e.key);
      if (isNaN(num) || num < 1 || num > 9) return;
      e.preventDefault();

      // Eğer dropdown açık ve bir preset üstünde hover varsa → kısayol ata
      if (showColorPresets && hoveredPresetIdx !== null) {
        const updated = { ...colorShortcuts, [num]: hoveredPresetIdx };
        setColorShortcuts(updated);
        localStorage.setItem('notes_color_shortcuts', JSON.stringify(updated));
        const preset = COLOR_PRESETS[hoveredPresetIdx];
        setShortcutToast({ key: num, label: preset.label });
        setTimeout(() => setShortcutToast(null), 1500);
        return;
      }

      // Dropdown kapalıysa → atanmış rengi uygula
      const presetIdx = colorShortcuts[num];
      if (presetIdx !== undefined && COLOR_PRESETS[presetIdx]) {
        applyPreset(COLOR_PRESETS[presetIdx]);
      }
    };
    const onKeyReset = (e) => {
      if (!e.altKey) return;
      if (e.key !== '"' && e.key !== "'") return;
      e.preventDefault();
      restoreSelection();
      document.execCommand('foreColor', false, '#c9d1d9');
      document.execCommand('hiliteColor', false, 'transparent');
      updateActiveFormats();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onKeyReset);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onKeyReset);
    };
  }, [showColorPresets, hoveredPresetIdx, colorShortcuts, applyPreset]);

  return (
    <div className="notes-container">
      {shortcutToast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: '#1c2128', border: '1px solid #444c56', borderRadius: 8,
          padding: '8px 18px', fontSize: 13, color: '#e6edf3', zIndex: 9999,
          boxShadow: '0 4px 16px #0008', pointerEvents: 'none',
        }}>
          Alt+{shortcutToast.key} → <b style={{ color: '#74b9ff' }}>{shortcutToast.label}</b>
        </div>
      )}
      {/* Floating Drag Ghost */}
      {draggedNote && (
        <div
          ref={noteGhostRef}
          className="note-drag-ghost"
          style={{
            width: draggedNote.width
          }}
        >
          <div className="note-item-top">
            <div className="note-drag-handle">⋮⋮</div>
            <div className="note-color-dot-wrap">
              <div
                className="note-color-dot"
                style={{ background: draggedNote.note.color || '#667eea' }}
              />
            </div>
            <h3 className="note-item-title">{draggedNote.note.title || 'Untitled'}</h3>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="notes-modal-overlay" onClick={cancelDelete}>
          <div className="notes-modal delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-icon">⚠️</div>
            <h3>Are you sure?</h3>
            <p className="delete-modal-text">
              {deleteConfirm.type === 'note'
                ? 'This note will be permanently deleted and cannot be recovered.'
                : 'This page will be permanently deleted and cannot be recovered.'}
            </p>
            <div className="notes-modal-buttons">
              <button className="notes-modal-btn cancel" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="notes-modal-btn delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`notes-sidebar${sidebarCollapsed ? ' notes-sidebar--collapsed' : ''}`}
        ref={sidebarRef}
        style={sidebarCollapsed ? {} : { width: `${sidebarWidth}px` }}
      >
        <div className="notes-sidebar-header">
          {!sidebarCollapsed && <span className="notes-header-label">NOTES</span>}
          {!sidebarCollapsed && <button className="notes-new-btn" onClick={createNewNote}>+ ADD</button>}
          {!sidebarCollapsed && (
            <div style={{ position: 'relative', marginLeft: 'auto' }} onMouseDown={e => e.stopPropagation()}>
              <button
                className="notes-collapse-btn"
                title="Settings"
                onClick={() => setShowNotesMenu(v => !v)}
              >⚙</button>
              {showNotesMenu && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 100,
                  background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
                  padding: '4px 0', minWidth: 150, boxShadow: '0 4px 16px #0008',
                }}>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => { setShowNotesMenu(false); exportAllNotes(); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', fontSize: 13 }}
                    onMouseEnter={e => e.target.style.background = '#21262d'}
                    onMouseLeave={e => e.target.style.background = 'none'}
                  >↓ Export (JSON)</button>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => { setShowNotesMenu(false); importNotes(); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', fontSize: 13 }}
                    onMouseEnter={e => e.target.style.background = '#21262d'}
                    onMouseLeave={e => e.target.style.background = 'none'}
                  >↑ Import (JSON)</button>
                </div>
              )}
            </div>
          )}
          {!sidebarCollapsed && (
            <div
              className="notes-sidebar-resizer-handle"
              onMouseDown={handleResizeMouseDown}
              title="Drag to resize"
            >⋮⋮</div>
          )}
          <button
            className="notes-collapse-btn"
            onClick={() => {
              const next = !sidebarCollapsed;
              setSidebarCollapsed(next);
              localStorage.setItem('notesSidebarCollapsed', String(next));
            }}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
        </div>

        {!sidebarCollapsed && <div className="notes-sidebar-inner">
        <div className="notes-search">
          <input
            type="text"
            placeholder="search..."
            value={searchQuery}
            onChange={(e) => { playTypeSoundThrottled(); setSearchQuery(e.target.value); }}
          />
        </div>

        <div className="notes-list">
          {filteredNotes.length === 0 ? (
            <div className="notes-empty">
              {searchQuery ? 'not found' : 'no notes yet'}
            </div>
          ) : (
            filteredNotes.map((note, index) => (
              <div
                key={note.id}
                data-note-id={note.id}
                className={`note-item ${currentNote?.id === note.id ? 'active' : ''} ${draggedNote?.note.id === note.id ? 'dragging' : ''} ${dragOverNoteId && String(dragOverNoteId) === String(note.id) ? 'drag-target' : ''}`}
                onMouseDown={(e) => handleNoteDragStart(e, note, index)}
                onClick={() => {
                  if (draggedNote) return; // Prevent click after drag
                  let noteToSelect = note;
                  if (!note.pages || note.pages.length < 2) {
                    const updatedPages = note.pages ? [...note.pages] : [];
                    while (updatedPages.length < 2) {
                      updatedPages.push({ id: Date.now() + updatedPages.length, title: `Page ${updatedPages.length + 1}`, content: '' });
                    }
                    noteToSelect = { ...note, pages: updatedPages };
                    updateNote(note.id, { pages: updatedPages });
                  }
                  setCurrentNote(noteToSelect);
                  setCurrentPageIndex(0);
                  setExpandedColor(null);
                }}
                onDoubleClick={(e) => handleNoteDoubleClick(note.id, e)}
                style={{ '--note-color': note.color || '#667eea' }}
              >
                <div className="note-item-top">
                  <div className="note-drag-handle" title="Drag to reorder">
                    ⋮⋮
                  </div>
                  <div className="note-color-dot-wrap">
                    <div
                      className="note-color-dot"
                      style={{ background: note.color || '#667eea' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedColor(expandedColor === note.id ? null : note.id);
                      }}
                    />
                  </div>
                  {editingNoteTitle === note.id ? (
                    <input
                      type="text"
                      className="note-item-title-edit"
                      value={note.title}
                      onChange={(e) => handleNoteTitleChange(note.id, e.target.value)}
                      onBlur={handleNoteTitleBlur}
                      onKeyDown={handleNoteTitleKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <h3 className="note-item-title">{note.title || 'Untitled'}</h3>
                  )}
                  {note.pages && note.pages.length > 2 && (
                    <span className="note-page-badge">{note.pages.length}p</span>
                  )}
                  <button
                    className="note-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNote(note.id);
                    }}
                    title="Delete note"
                  >
                    ×
                  </button>
                </div>

                {/* Inline color row */}
                {expandedColor === note.id && (
                  <div className="note-color-row" onClick={(e) => e.stopPropagation()}>
                    {colors.map(color => (
                      <div
                        key={color}
                        className={`note-color-swatch ${note.color === color ? 'selected' : ''}`}
                        style={{ background: color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateNote(note.id, { color });
                          setExpandedColor(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        </div>}
      </div>

      {/* Editor */}
      <div className="notes-editor">
        {currentNote ? (
          <>
            <div className="notes-editor-header">
              <input
                type="text"
                className="notes-title-input"
                placeholder="title..."
                value={currentNote.title}
                onChange={(e) => updateNote(currentNote.id, { title: e.target.value })}
              />
              <button className="notes-delete-btn" onClick={() => deleteNote(currentNote.id)}>DELETE</button>
            </div>

            {/* Formatting Toolbar */}
            <div className="notes-formatting-toolbar">
              {/* Text Formatting */}
              <div className="toolbar-group">
                <button
                  className={`toolbar-btn ${activeFormats.bold ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
                  title="Bold (Ctrl+B)"
                >
                  <strong>B</strong>
                </button>
                <button
                  className={`toolbar-btn ${activeFormats.italic ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
                  title="Italic (Ctrl+I)"
                >
                  <em>I</em>
                </button>
                <button
                  className={`toolbar-btn ${activeFormats.underline ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('underline'); }}
                  title="Underline (Ctrl+U)"
                >
                  <u>U</u>
                </button>
                <button
                  className={`toolbar-btn ${activeFormats.strikeThrough ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('strikeThrough'); }}
                  title="Strikethrough"
                >
                  <s>S</s>
                </button>
              </div>

              <div className="toolbar-divider" />

              {/* Font Size */}
              <div className="toolbar-group">
                <select
                  className="toolbar-select"
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => { applyFontSize(parseInt(e.target.value)); }}
                  value={activeFormats.fontSize || 14}
                >
                  {[8,9,10,11,12,13,14,15,16,18,20,22,24,26,28,32,36,42,48,56,64,72].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="toolbar-divider" />

              {/* Line Spacing */}
              <div className="toolbar-group">
                <select
                  className="toolbar-select"
                  onMouseDown={(e) => e.stopPropagation()}
                  value={String(lineSpacing)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setLineSpacing(v);
                    localStorage.setItem('notesLineSpacing', String(v));
                  }}
                  title="Line spacing"
                >
                  {[1, 1.2, 1.4, 1.5, 1.7, 2, 2.5, 3].map(v => (
                    <option key={v} value={String(v)}>{v.toFixed(1)}</option>
                  ))}
                </select>
              </div>

              <div className="toolbar-divider" />

              {/* Alignment */}
              <div className="toolbar-group">
                <button
                  className={`toolbar-btn ${activeFormats.justifyLeft ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('justifyLeft'); }}
                  title="Align Left"
                >
                  ⫷
                </button>
                <button
                  className={`toolbar-btn ${activeFormats.justifyCenter ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('justifyCenter'); }}
                  title="Align Center"
                >
                  ⫶
                </button>
                <button
                  className={`toolbar-btn ${activeFormats.justifyRight ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('justifyRight'); }}
                  title="Align Right"
                >
                  ⫸
                </button>
              </div>

              <div className="toolbar-divider" />

              {/* Lists */}
              <div className="toolbar-group">
                <button
                  className={`toolbar-btn ${activeFormats.insertUnorderedList ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('insertUnorderedList'); }}
                  title="Bullet List"
                >
                  •
                </button>
                <button
                  className={`toolbar-btn ${activeFormats.insertOrderedList ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); execFormat('insertOrderedList'); }}
                  title="Numbered List"
                >
                  1.
                </button>
              </div>

              <div className="toolbar-divider" />

              {/* Color Presets - Dropdown */}
              <div className="toolbar-group color-preset-wrapper">
                <button
                  className={`toolbar-btn color-toggle-btn ${showColorPresets ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    saveSelection();
                    setShowColorPresets(!showColorPresets);
                  }}
                  title="Text Color"
                >
                  <span style={{ background: 'linear-gradient(90deg, #f85149, #5c7cfa, #7ee787)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 }}>A</span>
                </button>
                {showColorPresets && (
                  <div className="color-presets-dropdown">
                    {COLOR_PRESETS.map((preset, i) => {
                      const assignedKey = Object.entries(colorShortcuts).find(([, v]) => v === i)?.[0];
                      return (
                        <button
                          key={i}
                          className="toolbar-color-preset"
                          title={`${preset.label}${assignedKey ? ` (Alt+${assignedKey})` : ' — hover + Alt+[1-9] to assign'}`}
                          onMouseEnter={() => setHoveredPresetIdx(i)}
                          onMouseLeave={() => setHoveredPresetIdx(null)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            applyPreset(preset, true);
                            setShowColorPresets(false);
                          }}
                          style={{
                            color: preset.fg,
                            background: preset.bg || 'transparent',
                            borderColor: preset.bg ? preset.bg : preset.fg,
                            position: 'relative',
                          }}
                        >
                          A
                          {assignedKey && (
                            <span style={{
                              position: 'absolute', bottom: 1, right: 2,
                              fontSize: 8, color: '#8b949e', lineHeight: 1,
                            }}>{assignedKey}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Spread Navigation */}
            <div className="notes-spread-nav">
              <button
                className="spread-nav-btn"
                onClick={() => setCurrentPageIndex(Math.max(0, currentSpreadIndex - 1))}
                disabled={currentSpreadIndex === 0}
              >
                ‹
              </button>
              <span className="spread-nav-label">{currentSpreadIndex * 2 + 1}-{currentSpreadIndex * 2 + 2} / {totalSpreads * 2}</span>
              <button
                className="spread-nav-btn"
                onClick={() => setCurrentPageIndex(Math.min(totalSpreads - 1, currentSpreadIndex + 1))}
                disabled={currentSpreadIndex >= totalSpreads - 1}
              >
                ›
              </button>
              <button className="spread-nav-btn add-spread-btn" onClick={addSpread} title="Add Spread">+</button>
            </div>

            {/* Notebook Style - Two Column Layout */}
            <div className="notes-notebook" onClick={() => showColorPresets && setShowColorPresets(false)}>
              <div className="notebook-pages-row">
                {/* Left Page */}
                <div className="notes-notebook-page left">
                  {leftPage && (
                    <RichTextEditor
                      key={`left-${currentNote.id}-${currentSpreadIndex}`}
                      ref={editorLeftRef}
                      content={leftPage.content || ''}
                      placeholder={`Page ${currentSpreadIndex * 2 + 1}...`}
                      style={{ lineHeight: lineSpacing }}
                      onChange={(content) => {
                        const pageIndex = currentSpreadIndex * 2;
                        const updatedPages = [...currentNote.pages];
                        if (updatedPages[pageIndex]) {
                          updatedPages[pageIndex] = { ...updatedPages[pageIndex], content };
                          updateNote(currentNote.id, { pages: updatedPages });
                        }
                      }}
                    />
                  )}
                </div>

                {/* Center Binding */}
                <div className="notebook-binding" />

                {/* Right Page */}
                <div className="notes-notebook-page right">
                  {rightPage && (
                    <RichTextEditor
                      key={`right-${currentNote.id}-${currentSpreadIndex}`}
                      ref={editorRightRef}
                      content={rightPage.content || ''}
                      placeholder={`Page ${currentSpreadIndex * 2 + 2}...`}
                      style={{ lineHeight: lineSpacing }}
                      onChange={(content) => {
                        const pageIndex = currentSpreadIndex * 2 + 1;
                        const updatedPages = [...currentNote.pages];
                        if (updatedPages[pageIndex]) {
                          updatedPages[pageIndex] = { ...updatedPages[pageIndex], content };
                          updateNote(currentNote.id, { pages: updatedPages });
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>



          </>
        ) : (
          <div className="notes-editor-empty">
            <h3>Select a note</h3>
            <p>Select a note from the left or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Notes;
