import { useState, useEffect, useRef, useCallback } from 'react';
import './Notes.css';

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
  const editorLeftRef = useRef(null);
  const editorRightRef = useRef(null);
  const sidebarRef = useRef(null);

  // Sidebar resize handlers
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(200, e.clientX), 500);
    setSidebarWidth(newWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('notesSidebarWidth', sidebarWidth.toString());
    }
  }, [isResizing, sidebarWidth]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

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
    // Auto-focus on title for editing
    setEditingNoteTitle(newNote.id);
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
    // Navigate to the new spread
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

  const colors = [
    '#667eea', '#f093fb', '#4ade80', '#60a5fa',
    '#fb923c', '#f87171', '#58a6ff', '#9ca3af'
  ];

  return (
    <div className="notes-container">
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
          onMouseDown={handleMouseDown}
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
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="notes-list">
          {filteredNotes.length === 0 ? (
            <div className="notes-empty">
              {searchQuery ? 'not found' : 'no notes yet'}
            </div>
          ) : (
            filteredNotes.map(note => (
              <div
                key={note.id}
                className={`note-item ${currentNote?.id === note.id ? 'active' : ''}`}
                onClick={() => {
                  // Ensure note has at least 2 pages for the notebook view
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

            {/* Spread Navigation Toolbar */}
            <div className="notes-formatting-toolbar">
              <div className="toolbar-group spread-nav">
                {/* Spread tabs */}
                {Array.from({ length: totalSpreads }, (_, i) => (
                  <button
                    key={i}
                    className={`spread-tab ${currentSpreadIndex === i ? 'active' : ''}`}
                    onClick={() => setCurrentPageIndex(i)}
                  >
                    {i * 2 + 1}-{i * 2 + 2}
                  </button>
                ))}
                <button className="page-add-btn-toolbar" onClick={addSpread}>+ Add Spread</button>
              </div>
            </div>

            {/* Notebook Style - Two Column Layout */}
            <div className="notes-notebook">
              {/* Page Title - spans both pages */}
              <div className="notebook-full-header">
                <span className="spread-indicator">Pages {currentSpreadIndex * 2 + 1}-{currentSpreadIndex * 2 + 2}</span>
              </div>

              <div className="notebook-pages-row">
                {/* Left Page */}
                <div className="notes-notebook-page left">
                  {leftPage && (
                    <textarea
                      ref={editorLeftRef}
                      className="notebook-page-textarea"
                      value={leftPage.content || ''}
                      onChange={(e) => {
                        const content = e.target.value;
                        const pageIndex = currentSpreadIndex * 2;
                        const updatedPages = [...currentNote.pages];
                        if (updatedPages[pageIndex]) {
                          updatedPages[pageIndex] = { ...updatedPages[pageIndex], content };
                          updateNote(currentNote.id, { pages: updatedPages });
                        }
                      }}
                      placeholder={`Page ${currentSpreadIndex * 2 + 1}...`}
                    />
                  )}
                </div>

                {/* Center Binding */}
                <div className="notebook-binding" />

                {/* Right Page */}
                <div className="notes-notebook-page right">
                  {rightPage && (
                    <textarea
                      ref={editorRightRef}
                      className="notebook-page-textarea"
                      value={rightPage.content || ''}
                      onChange={(e) => {
                        const content = e.target.value;
                        const pageIndex = currentSpreadIndex * 2 + 1;
                        const updatedPages = [...currentNote.pages];
                        if (updatedPages[pageIndex]) {
                          updatedPages[pageIndex] = { ...updatedPages[pageIndex], content };
                          updateNote(currentNote.id, { pages: updatedPages });
                        }
                      }}
                      placeholder={`Page ${currentSpreadIndex * 2 + 2}...`}
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
