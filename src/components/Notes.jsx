import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import './Notes.css';
import { playTypeSoundThrottled, playClickSound, playAddSound, playDeleteSound } from '../utils/sounds';

// Rich Text Editor Component
const RichTextEditor = forwardRef(({ content, placeholder, onChange }, ref) => {
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
    />
  );
});

function Notes() {
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('notes');
    return saved ? JSON.parse(saved) : [];
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
  const [isResizing, setIsResizing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, type: null, id: null });
  const [activeFormats, setActiveFormats] = useState({});
  const [showColorPresets, setShowColorPresets] = useState(false);
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

  // Apply color with selection restore
  const applyColor = (command, value) => {
    restoreSelection();
    document.execCommand(command, false, value);
    updateActiveFormats();
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
    });
  };

  const handleSelectionChange = useCallback(() => {
    updateActiveFormats();
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  // Sidebar resize handlers
  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMouseMove = useCallback((e) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(200, e.clientX), 500);
    setSidebarWidth(newWidth);
  }, [isResizing]);

  const handleResizeMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('notesSidebarWidth', sidebarWidth.toString());
    }
  }, [isResizing, sidebarWidth]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleResizeMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup', handleResizeMouseUp);
      };
    }
  }, [isResizing, handleResizeMouseMove, handleResizeMouseUp]);

  useEffect(() => {
    localStorage.setItem('notes', JSON.stringify(notes));
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
    '#fb923c', '#f87171', '#58a6ff', '#9ca3af'
  ];

  return (
    <div className="notes-container">
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
        className="notes-sidebar"
        ref={sidebarRef}
        style={{ width: `${sidebarWidth}px` }}
      >
        <div
          className="notes-sidebar-resizer"
          onMouseDown={handleResizeMouseDown}
        />
        <div className="notes-sidebar-header">
          <span className="notes-header-label">NOTES</span>
          <button className="notes-new-btn" onClick={createNewNote}>+ ADD</button>
        </div>

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
                  onChange={(e) => { execFormat('fontSize', e.target.value); }}
                  defaultValue="3"
                >
                  <option value="1">10</option>
                  <option value="2">12</option>
                  <option value="3">14</option>
                  <option value="4">18</option>
                  <option value="5">24</option>
                  <option value="6">32</option>
                  <option value="7">48</option>
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
                  <span style={{ background: 'linear-gradient(90deg, #f85149, #58a6ff, #7ee787)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 }}>A</span>
                </button>
                {showColorPresets && (
                  <div className="color-presets-dropdown">
                    {[
                      { fg: '#c9d1d9', bg: null, label: 'Default' },
                      { fg: '#f85149', bg: null, label: 'Red' },
                      { fg: '#58a6ff', bg: null, label: 'Blue' },
                      { fg: '#7ee787', bg: null, label: 'Green' },
                      { fg: '#d2a8ff', bg: null, label: 'Purple' },
                      { fg: '#f0883e', bg: null, label: 'Orange' },
                      { fg: '#ffffff', bg: '#1f6feb', label: 'Blue BG' },
                      { fg: '#ffffff', bg: '#238636', label: 'Green BG' },
                      { fg: '#ffffff', bg: '#da3633', label: 'Red BG' },
                      { fg: '#000000', bg: '#e3b341', label: 'Yellow BG' },
                    ].map((preset, i) => (
                      <button
                        key={i}
                        className="toolbar-color-preset"
                        title={preset.label}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          restoreSelection();
                          document.execCommand('foreColor', false, preset.fg);
                          if (preset.bg) {
                            document.execCommand('hiliteColor', false, preset.bg);
                          } else {
                            document.execCommand('hiliteColor', false, 'transparent');
                          }
                          updateActiveFormats();
                          setShowColorPresets(false);
                        }}
                        style={{
                          color: preset.fg,
                          background: preset.bg || 'transparent',
                          borderColor: preset.bg ? preset.bg : preset.fg,
                        }}
                      >
                        A
                      </button>
                    ))}
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
