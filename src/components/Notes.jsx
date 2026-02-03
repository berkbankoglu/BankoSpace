import { useState, useEffect } from 'react';
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

  useEffect(() => {
    localStorage.setItem('notes', JSON.stringify(notes));
  }, [notes]);

  const createNewNote = () => {
    const newNote = {
      id: Date.now(),
      title: 'Yeni Not',
      pages: [{ id: Date.now(), title: 'Sayfa 1', content: '' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      color: '#667eea'
    };
    setNotes([newNote, ...notes]);
    setCurrentNote(newNote);
    setCurrentPageIndex(0);
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
    const confirmed = window.confirm('Bu notu silmek istediğinizden emin misiniz?');
    if (!confirmed) return;
    setNotes(notes.filter(note => note.id !== id));
    if (currentNote?.id === id) {
      setCurrentNote(null);
      setCurrentPageIndex(0);
    }
  };

  const addPage = () => {
    if (!currentNote) return;
    const newPage = {
      id: Date.now(),
      title: `Sayfa ${currentNote.pages.length + 1}`,
      content: ''
    };
    const updatedPages = [...currentNote.pages, newPage];
    updateNote(currentNote.id, { pages: updatedPages });
    setCurrentPageIndex(updatedPages.length - 1);
  };

  const deletePage = (pageId) => {
    if (!currentNote || currentNote.pages.length <= 1) return;
    const confirmed = window.confirm('Bu sayfayı silmek istediğinizden emin misiniz?');
    if (!confirmed) return;
    const updatedPages = currentNote.pages.filter(p => p.id !== pageId);
    updateNote(currentNote.id, { pages: updatedPages });
    if (currentPageIndex >= updatedPages.length) setCurrentPageIndex(updatedPages.length - 1);
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
    '#fb923c', '#f87171', '#fbbf24', '#9ca3af'
  ];

  const currentPage = currentNote?.pages?.[currentPageIndex];

  return (
    <div className="notes-container">
      {/* Sidebar */}
      <div className="notes-sidebar">
        <div className="notes-sidebar-header">
          <span className="notes-header-label">NOTLAR</span>
          <button className="notes-new-btn" onClick={createNewNote}>+ EKLE</button>
        </div>

        <div className="notes-search">
          <input
            type="text"
            placeholder="ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="notes-list">
          {filteredNotes.length === 0 ? (
            <div className="notes-empty">
              {searchQuery ? 'bulunamadı' : 'henüz not yok'}
            </div>
          ) : (
            filteredNotes.map(note => (
              <div
                key={note.id}
                className={`note-item ${currentNote?.id === note.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentNote(note);
                  setCurrentPageIndex(0);
                  setExpandedColor(null);
                }}
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
                  <h3 className="note-item-title">{note.title || 'Başlıksız'}</h3>
                  {note.pages && note.pages.length > 1 && (
                    <span className="note-page-badge">{note.pages.length}p</span>
                  )}
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
              <button className="notes-delete-btn" onClick={() => deleteNote(currentNote.id)}>SIL</button>
            </div>

            <input
              type="text"
              className="notes-title-input"
              placeholder="başlık..."
              value={currentNote.title}
              onChange={(e) => updateNote(currentNote.id, { title: e.target.value })}
            />

            {/* Pages */}
            <div className="notes-pages-nav">
              {currentNote.pages?.map((page, index) => (
                <div
                  key={page.id}
                  className={`page-tab ${index === currentPageIndex ? 'active' : ''}`}
                  onClick={() => setCurrentPageIndex(index)}
                >
                  <input
                    type="text"
                    className="page-tab-title"
                    value={page.title}
                    onChange={(e) => updatePage(page.id, { title: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {currentNote.pages.length > 1 && (
                    <button
                      className="page-tab-delete"
                      onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}
                    >×</button>
                  )}
                </div>
              ))}
              <button className="page-add-btn" onClick={addPage}>+ SAYFA</button>
            </div>

            {/* Content */}
            {currentPage && (
              <textarea
                className="notes-content-input"
                placeholder="yazın..."
                value={currentPage.content || ''}
                onChange={(e) => updatePage(currentPage.id, { content: e.target.value })}
              />
            )}
          </>
        ) : (
          <div className="notes-editor-empty">
            <h3>Not seçin</h3>
            <p>Sol taraftan bir not seçin veya yeni not oluşturun</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Notes;
