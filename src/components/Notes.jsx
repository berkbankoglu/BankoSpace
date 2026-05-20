import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import './Notes.css';
import { playTypeSoundThrottled, playClickSound, playAddSound, playDeleteSound } from '../utils/sounds';
import { pushKeyToSupabase } from '../supabase';

function rgbToHex(rgb) {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
}

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

const FG_MAP = {
  '#f85149': '#ff6b6b', '#FF7369': '#ff6b6b',
  '#5c7cfa': '#74b9ff', '#529CCA': '#74b9ff',
  '#7ee787': '#55efc4', '#4DAB9A': '#55efc4',
  '#d2a8ff': '#a29bfe', '#9B8FD4': '#a29bfe',
  '#f0883e': '#fdcb6e', '#C98A4B': '#fdcb6e',
  '#ffffff': '#e2e8f0', '#000000': '#e2e8f0', '#c9d1d9': '#c9d1d9',
};
const BG_MAP = {
  '#1f6feb': '#1e3a5f', '#364954': '#1e3a5f',
  '#238636': '#14432a', '#354C4B': '#14432a',
  '#da3633': '#4a1515', '#594141': '#4a1515',
  '#e3b341': '#4a3800', '#59563B': '#4a3800',
};

function migrateHtml(html) {
  if (!html) return html;
  let out = html.replace(/color:\s*(#[0-9a-fA-F]{6})/g, (m, c) => {
    const key = c.toLowerCase();
    const mapped = Object.entries(FG_MAP).find(([k]) => k.toLowerCase() === key);
    return mapped ? `color: ${mapped[1]}` : m;
  });
  out = out.replace(/background-color:\s*(#[0-9a-fA-F]{6})/g, (m, c) => {
    const key = c.toLowerCase();
    const mapped = Object.entries(BG_MAP).find(([k]) => k.toLowerCase() === key);
    return mapped ? `background-color: ${mapped[1]}` : m;
  });
  return out;
}

function migrateNote(note) {
  if (note.subNotes !== undefined) return note;
  if (note.pages) {
    return {
      id: note.id,
      title: note.title,
      content: migrateHtml(note.pages[0]?.content || ''),
      subNotes: note.pages.slice(1).map(p => ({
        id: p.id,
        title: p.title || 'Sub Note',
        content: migrateHtml(p.content || ''),
      })),
      color: note.color || '#667eea',
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }
  return {
    id: note.id || Date.now(),
    title: note.title || 'Note',
    content: note.content || '',
    subNotes: [],
    color: note.color || '#667eea',
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

const RichTextEditor = forwardRef(({ content, placeholder, onChange, style }, ref) => {
  const editorRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(!content);
  const [pendingImg, setPendingImg] = useState(null); // { dataUrl, anchorRect }
  const [pendingTitle, setPendingTitle] = useState('Screenshot');
  const [preview, setPreview] = useState(null); // { dataUrl, rect }
  const [lightbox, setLightbox] = useState(null); // { dataUrl }
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const pendingRangeRef = useRef(null);
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content || '';
      setIsEmpty(!content);
    }
  }, []);

  useEffect(() => {
    if (pendingImg) setTimeout(() => { titleInputRef.current?.focus(); titleInputRef.current?.select(); }, 0);
  }, [pendingImg]);

  const handleInput = () => {
    playTypeSoundThrottled();
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setIsEmpty(!editorRef.current.textContent?.trim());
      onChange(html);
    }
  };

  const insertImageEmbed = (dataUrl, title) => {
    if (!dataUrl) return; // still loading
    const range = pendingRangeRef.current;
    if (!range) return;
    const span = document.createElement('span');
    span.className = 'note-img-embed';
    span.contentEditable = 'false';
    span.setAttribute('data-img', dataUrl);
    span.textContent = '📷 ' + (title.trim() || 'Screenshot');
    range.deleteContents();
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);
    pendingRangeRef.current = null;
    setPendingImg(null);
    setPendingTitle('Screenshot');
    if (editorRef.current) { setIsEmpty(false); onChange(editorRef.current.innerHTML); }
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const sel = window.getSelection();
    pendingRangeRef.current = sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

    // Measure cursor position using a hidden anchor span (synchronous — no paint between insert and remove)
    let anchorRect = { top: 120, left: 200 };
    if (pendingRangeRef.current) {
      const anchor = document.createElement('span');
      anchor.style.cssText = 'visibility:hidden;font-size:0;line-height:0;';
      anchor.textContent = '|';
      pendingRangeRef.current.insertNode(anchor);
      const r = anchor.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        anchorRect = { top: r.bottom + 6, left: r.left };
      } else if (editorRef.current) {
        // anchor had no size — use its parent line position
        const parent = anchor.parentElement;
        const pr = parent ? parent.getBoundingClientRect() : editorRef.current.getBoundingClientRect();
        anchorRect = { top: pr.bottom + 6, left: pr.left + 20 };
      }
      anchor.remove();
      // Re-save range after DOM mutation
      pendingRangeRef.current = window.getSelection()?.rangeCount > 0
        ? window.getSelection().getRangeAt(0).cloneRange()
        : null;
    }

    // Show overlay immediately (loading state) so user sees it at cursor right away
    setPendingImg({ dataUrl: null, anchorRect });
    setPendingTitle('Screenshot');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const imgEl = new window.Image();
      imgEl.onload = () => {
        const maxW = 1600;
        const scale = imgEl.width > maxW ? maxW / imgEl.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(imgEl.width * scale);
        canvas.height = Math.round(imgEl.height * scale);
        canvas.getContext('2d').drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        setPendingImg(prev => prev ? { ...prev, dataUrl: canvas.toDataURL('image/png') } : null);
      };
      imgEl.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Hover preview & click lightbox via event delegation
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const onOver = (e) => {
      const embed = e.target.closest?.('.note-img-embed');
      if (embed) setPreview({ dataUrl: embed.getAttribute('data-img'), x: e.clientX, y: e.clientY, el: embed });
    };
    const onMove = (e) => {
      const embed = e.target.closest?.('.note-img-embed');
      if (embed) setPreview(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    };
    const onOut = (e) => {
      if (e.target.closest?.('.note-img-embed')) setPreview(null);
    };
    const onClick = (e) => {
      const embed = e.target.closest?.('.note-img-embed');
      if (embed) { e.preventDefault(); setLightbox({ dataUrl: embed.getAttribute('data-img') }); setLightboxZoom(1); }
    };
    editor.addEventListener('mouseover', onOver);
    editor.addEventListener('mousemove', onMove);
    editor.addEventListener('mouseout', onOut);
    editor.addEventListener('click', onClick);
    return () => {
      editor.removeEventListener('mouseover', onOver);
      editor.removeEventListener('mousemove', onMove);
      editor.removeEventListener('mouseout', onOut);
      editor.removeEventListener('click', onClick);
    };
  }, []);

  // Esc closes lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const deleteEmbed = (el) => {
    el?.remove();
    setPreview(null);
    if (editorRef.current) { setIsEmpty(!editorRef.current.textContent?.trim()); onChange(editorRef.current.innerHTML); }
  };

  return (
    <>
      <div
        ref={(el) => { editorRef.current = el; if (ref) ref.current = el; }}
        className={`notebook-page-editor ${isEmpty ? 'empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={style}
      />

      {/* Title input overlay — appears at cursor right after paste */}
      {pendingImg && (
        <div className="note-img-title-overlay" style={{ top: pendingImg.anchorRect.top, left: pendingImg.anchorRect.left }}>
          <span className="note-img-title-icon">{pendingImg.dataUrl ? '📷' : '⏳'}</span>
          <input
            ref={titleInputRef}
            className="note-img-title-input"
            value={pendingTitle}
            onChange={e => setPendingTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); insertImageEmbed(pendingImg.dataUrl, pendingTitle); }
              if (e.key === 'Escape') { setPendingImg(null); pendingRangeRef.current = null; }
            }}
            placeholder={pendingImg.dataUrl ? 'Başlık yaz, Enter\'a bas...' : 'Yükleniyor...'}
            disabled={!pendingImg.dataUrl}
          />
          <button
            className="note-img-title-confirm"
            onClick={() => insertImageEmbed(pendingImg.dataUrl, pendingTitle)}
            disabled={!pendingImg.dataUrl}
          >↵</button>
        </div>
      )}

      {/* Hover preview — above mouse cursor */}
      {preview && (
        <div className="note-img-preview" style={{
          bottom: window.innerHeight - preview.y + 14,
          left: Math.min(Math.max(8, preview.x - 8), window.innerWidth - 656),
        }}>
          <img src={preview.dataUrl} className="note-img-preview-img" alt="" />
          <button
            className="note-img-delete-btn"
            onClick={(e) => { e.stopPropagation(); deleteEmbed(preview.el); }}
            title="Sil"
          >×</button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="note-img-lightbox" onClick={() => setLightbox(null)} onWheel={e => { e.preventDefault(); setLightboxZoom(z => Math.min(6, Math.max(0.25, z - e.deltaY * 0.001))); }}>
          <div className="note-img-lightbox-bar" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightboxZoom(z => Math.min(6, z + 0.25))}>＋</button>
            <span>{Math.round(lightboxZoom * 100)}%</span>
            <button onClick={() => setLightboxZoom(z => Math.max(0.25, z - 0.25))}>－</button>
            <button onClick={() => setLightboxZoom(1)}>1:1</button>
            <button className="note-img-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          </div>
          <div className="note-img-lightbox-body" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.dataUrl}
              className="note-img-lightbox-img"
              style={{ transform: `scale(${lightboxZoom})`, transformOrigin: 'top center' }}
              draggable={false}
              alt=""
            />
          </div>
        </div>
      )}
    </>
  );
});

function Notes() {
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('notes');
    const backup = localStorage.getItem('notes_local_backup');
    const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
    const a = parse(saved), b = parse(backup);
    const raw = (a && b) ? (a.length >= b.length ? a : b) : (a || b || []);
    return raw.map(migrateNote);
  });

  const [selected, setSelected] = useState(null); // { noteId, subId: number|null }
  const [expandedNotes, setExpandedNotes] = useState(() => {
    const saved = localStorage.getItem('notes');
    try {
      const raw = saved ? JSON.parse(saved) : [];
      return new Set(raw.map(n => n.id));
    } catch { return new Set(); }
  });
  const [editingTitle, setEditingTitle] = useState(null); // { noteId, subId }
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFormats, setActiveFormats] = useState({});
  const [showColorPresets, setShowColorPresets] = useState(false);
  const [colorShortcuts, setColorShortcuts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notes_color_shortcuts') || '{}'); } catch { return {}; }
  });
  const [hoveredPresetIdx, setHoveredPresetIdx] = useState(null);
  const [shortcutToast, setShortcutToast] = useState(null);
  const [lineSpacing, setLineSpacing] = useState(() => {
    const v = parseFloat(localStorage.getItem('notesLineSpacing') || '1.7');
    return Math.round(v * 10) / 10;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    return parseInt(localStorage.getItem('notesSidebarWidth') || '240');
  });
  const [showMenu, setShowMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { noteId, subId? }

  const sidebarRef = useRef(null);
  const editorRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const isResizingRef = useRef(false);

  useEffect(() => {
    if (notes.length === 0) return;
    const serialized = JSON.stringify(notes);
    localStorage.setItem('notes', serialized);
    localStorage.setItem('notes_local_backup', serialized);
    pushKeyToSupabase('notes', serialized);
  }, [notes]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  };

  const execFormat = (command, value = null) => {
    playClickSound();
    document.execCommand(command, false, value);
    updateActiveFormats();
  };

  const applyFontSize = (px) => {
    playClickSound();
    document.execCommand('fontSize', false, '7');
    const editor = editorRef.current;
    if (editor) {
      editor.querySelectorAll('font[size="7"]').forEach(el => {
        el.removeAttribute('size');
        el.style.fontSize = px + 'px';
      });
    }
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

  const handleSelectionChange = useCallback(() => { updateActiveFormats(); }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

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
      const newWidth = Math.min(Math.max(180, resizeStartWidthRef.current + delta), 500);
      if (sidebarRef.current) sidebarRef.current.style.width = `${newWidth}px`;
    }

    function onUp(ev) {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const delta = ev.clientX - resizeStartXRef.current;
      const newWidth = Math.min(Math.max(180, resizeStartWidthRef.current + delta), 500);
      setSidebarWidth(newWidth);
      localStorage.setItem('notesSidebarWidth', newWidth.toString());
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  const createNote = () => {
    const id = Date.now();
    const newNote = {
      id,
      title: 'New Note',
      content: '',
      subNotes: [],
      color: '#667eea',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setNotes(prev => [newNote, ...prev]);
    setExpandedNotes(prev => new Set([...prev, id]));
    setSelected({ noteId: id, subId: null });
    setEditingTitle({ noteId: id, subId: null });
    setEditingTitleValue('New Note');
    playAddSound();
  };

  const addSubNote = (noteId, e) => {
    e.stopPropagation();
    const id = Date.now();
    const newSub = { id, title: 'New Sub Note', content: '' };
    setNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, subNotes: [...(n.subNotes || []), newSub] } : n
    ));
    setExpandedNotes(prev => new Set([...prev, noteId]));
    setSelected({ noteId, subId: id });
    setEditingTitle({ noteId, subId: id });
    setEditingTitleValue('New Sub Note');
    playAddSound();
  };

  const toggleExpand = (noteId, e) => {
    e.stopPropagation();
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const startDeleteNote = (noteId, subId, e) => {
    e.stopPropagation();
    setDeleteConfirm({ noteId, subId: subId ?? null });
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    playDeleteSound();
    const { noteId, subId } = deleteConfirm;
    if (subId === null) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
      if (selected?.noteId === noteId) setSelected(null);
    } else {
      setNotes(prev => prev.map(n =>
        n.id === noteId ? { ...n, subNotes: n.subNotes.filter(s => s.id !== subId) } : n
      ));
      if (selected?.noteId === noteId && selected?.subId === subId) {
        setSelected({ noteId, subId: null });
      }
    }
    setDeleteConfirm(null);
  };

  const applyPreset = useCallback((preset, useRestore = false) => {
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
    if (sameFg && sameBg) {
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
      if (showColorPresets && hoveredPresetIdx !== null) {
        const updated = { ...colorShortcuts, [num]: hoveredPresetIdx };
        setColorShortcuts(updated);
        localStorage.setItem('notes_color_shortcuts', JSON.stringify(updated));
        setShortcutToast({ key: num, label: COLOR_PRESETS[hoveredPresetIdx].label });
        setTimeout(() => setShortcutToast(null), 1500);
        return;
      }
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
    } catch (e) { console.error('Export error:', e); }
  };

  const importNotes = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const filePath = await open({ filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!filePath) return;
      const text = await readTextFile(filePath);
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) { alert('Invalid file'); return; }
      setNotes(imported.map(migrateNote));
    } catch (e) { console.error('Import error:', e); alert('Could not read file'); }
  };

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.subNotes?.some(s =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.content?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const selectedNote = selected ? notes.find(n => n.id === selected.noteId) : null;
  const selectedSub = selectedNote && selected?.subId != null
    ? selectedNote.subNotes?.find(s => s.id === selected.subId)
    : null;
  const selectedTitle = selectedSub ? selectedSub.title : selectedNote?.title;
  const selectedContent = selectedSub ? selectedSub.content : selectedNote?.content;

  const updateSelectedContent = (content) => {
    if (!selected) return;
    setNotes(prev => prev.map(n => {
      if (n.id !== selected.noteId) return n;
      if (selected.subId === null) return { ...n, content, updatedAt: new Date().toISOString() };
      return {
        ...n,
        subNotes: n.subNotes.map(s => s.id === selected.subId ? { ...s, content } : s),
        updatedAt: new Date().toISOString(),
      };
    }));
  };

  const updateTitle = (title) => {
    if (!selected) return;
    setNotes(prev => prev.map(n => {
      if (n.id !== selected.noteId) return n;
      if (selected.subId === null) return { ...n, title };
      return { ...n, subNotes: n.subNotes.map(s => s.id === selected.subId ? { ...s, title } : s) };
    }));
  };

  const commitTitleEdit = (title) => {
    if (!editingTitle) return;
    const { noteId, subId } = editingTitle;
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      if (subId === null) return { ...n, title };
      return { ...n, subNotes: n.subNotes.map(s => s.id === subId ? { ...s, title } : s) };
    }));
    setEditingTitle(null);
  };

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

      {deleteConfirm && (
        <div className="notes-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="notes-modal delete-modal" onClick={e => e.stopPropagation()}>
            <div className="delete-modal-icon">⚠️</div>
            <h3>Are you sure?</h3>
            <p className="delete-modal-text">
              {deleteConfirm.subId === null
                ? 'This note and all its sub notes will be permanently deleted.'
                : 'This sub note will be permanently deleted.'}
            </p>
            <div className="notes-modal-buttons">
              <button className="notes-modal-btn cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="notes-modal-btn delete" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="notes-sidebar" ref={sidebarRef} style={{ width: sidebarWidth }}>
        <div className="notes-sidebar-header">
          <span className="notes-header-label">NOTES</span>
          <button className="notes-new-btn" onClick={createNote}>+ ADD</button>
          <div style={{ position: 'relative', marginLeft: 'auto' }} onMouseDown={e => e.stopPropagation()}>
            <button className="notes-collapse-btn" title="Settings" onClick={() => setShowMenu(v => !v)}>⚙</button>
            {showMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 100,
                background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
                padding: '4px 0', minWidth: 150, boxShadow: '0 4px 16px #0008',
              }}>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { setShowMenu(false); exportAllNotes(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', fontSize: 13 }}
                  onMouseEnter={e => e.target.style.background = '#21262d'}
                  onMouseLeave={e => e.target.style.background = 'none'}
                >↓ Export (JSON)</button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { setShowMenu(false); importNotes(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', fontSize: 13 }}
                  onMouseEnter={e => e.target.style.background = '#21262d'}
                  onMouseLeave={e => e.target.style.background = 'none'}
                >↑ Import (JSON)</button>
              </div>
            )}
          </div>
          <div className="notes-sidebar-resizer-handle" onMouseDown={handleResizeMouseDown}>⋮⋮</div>
        </div>

        <div className="notes-sidebar-inner">
          <div className="notes-search">
            <input
              type="text"
              placeholder="search..."
              value={searchQuery}
              onChange={e => { playTypeSoundThrottled(); setSearchQuery(e.target.value); }}
            />
          </div>

          <div className="notes-tree">
            {filteredNotes.length === 0 ? (
              <div className="notes-empty">{searchQuery ? 'not found' : 'no notes yet'}</div>
            ) : filteredNotes.map(note => (
              <div key={note.id} className="notes-tree-group">
                {/* Note row */}
                <div
                  className={`notes-tree-row${selected?.noteId === note.id && selected?.subId == null ? ' active' : ''}`}
                  onClick={() => setSelected({ noteId: note.id, subId: null })}
                >
                  <button
                    className="notes-expand-btn"
                    onClick={e => toggleExpand(note.id, e)}
                  >
                    {note.subNotes?.length > 0
                      ? (expandedNotes.has(note.id) ? '▾' : '▸')
                      : <span className="notes-expand-placeholder" />}
                  </button>

                  {editingTitle?.noteId === note.id && editingTitle?.subId == null ? (
                    <input
                      className="notes-title-edit-inline"
                      value={editingTitleValue}
                      onChange={e => setEditingTitleValue(e.target.value)}
                      onBlur={() => commitTitleEdit(editingTitleValue)}
                      onKeyDown={e => { if (e.key === 'Enter') commitTitleEdit(editingTitleValue); }}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="notes-tree-title"
                      onDoubleClick={e => {
                        e.stopPropagation();
                        setEditingTitle({ noteId: note.id, subId: null });
                        setEditingTitleValue(note.title);
                      }}
                    >
                      {note.title || 'Untitled'}
                    </span>
                  )}

                  <div className="notes-tree-actions">
                    <button
                      className="notes-tree-add-sub"
                      title="Add sub note"
                      onClick={e => addSubNote(note.id, e)}
                    >+</button>
                    <button
                      className="notes-tree-del"
                      title="Delete note"
                      onClick={e => startDeleteNote(note.id, null, e)}
                    >×</button>
                  </div>
                </div>

                {/* Sub notes */}
                {expandedNotes.has(note.id) && note.subNotes?.map((sub, si) => (
                  <div
                    key={sub.id}
                    className={`notes-tree-row notes-sub-row${selected?.noteId === note.id && selected?.subId === sub.id ? ' active' : ''}`}
                    onClick={() => setSelected({ noteId: note.id, subId: sub.id })}
                  >
                    {editingTitle?.noteId === note.id && editingTitle?.subId === sub.id ? (
                      <input
                        className="notes-title-edit-inline"
                        value={editingTitleValue}
                        onChange={e => setEditingTitleValue(e.target.value)}
                        onBlur={() => commitTitleEdit(editingTitleValue)}
                        onKeyDown={e => { if (e.key === 'Enter') commitTitleEdit(editingTitleValue); }}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="notes-tree-title"
                        onDoubleClick={e => {
                          e.stopPropagation();
                          setEditingTitle({ noteId: note.id, subId: sub.id });
                          setEditingTitleValue(sub.title);
                        }}
                      >
                        {sub.title || 'Untitled'}
                      </span>
                    )}

                    <div className="notes-tree-actions">
                      <button
                        className="notes-tree-del"
                        title="Delete sub note"
                        onClick={e => startDeleteNote(note.id, sub.id, e)}
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="notes-editor">
        {selectedNote ? (
          <>
            <div className="notes-editor-header">
              <input
                className="notes-title-input"
                placeholder="title..."
                value={selectedTitle || ''}
                onChange={e => updateTitle(e.target.value)}
              />
            </div>

            {/* Formatting Toolbar */}
            <div className="notes-formatting-toolbar">
              <div className="toolbar-group">
                <button className={`toolbar-btn ${activeFormats.bold ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('bold'); }} title="Bold (Ctrl+B)"><strong>B</strong></button>
                <button className={`toolbar-btn ${activeFormats.italic ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('italic'); }} title="Italic (Ctrl+I)"><em>I</em></button>
                <button className={`toolbar-btn ${activeFormats.underline ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('underline'); }} title="Underline (Ctrl+U)"><u>U</u></button>
                <button className={`toolbar-btn ${activeFormats.strikeThrough ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('strikeThrough'); }} title="Strikethrough"><s>S</s></button>
              </div>

              <div className="toolbar-divider" />

              <div className="toolbar-group">
                <select
                  className="toolbar-select"
                  onMouseDown={e => e.stopPropagation()}
                  onChange={e => applyFontSize(parseInt(e.target.value))}
                  value={activeFormats.fontSize || 14}
                >
                  {[8,9,10,11,12,13,14,15,16,18,20,22,24,26,28,32,36,42,48,56,64,72].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="toolbar-divider" />

              <div className="toolbar-group">
                <select
                  className="toolbar-select"
                  onMouseDown={e => e.stopPropagation()}
                  value={String(lineSpacing)}
                  onChange={e => {
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

              <div className="toolbar-group">
                <button className={`toolbar-btn ${activeFormats.justifyLeft ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('justifyLeft'); }} title="Align Left">⫷</button>
                <button className={`toolbar-btn ${activeFormats.justifyCenter ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('justifyCenter'); }} title="Align Center">⫶</button>
                <button className={`toolbar-btn ${activeFormats.justifyRight ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('justifyRight'); }} title="Align Right">⫸</button>
              </div>

              <div className="toolbar-divider" />

              <div className="toolbar-group">
                <button className={`toolbar-btn ${activeFormats.insertUnorderedList ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('insertUnorderedList'); }} title="Bullet List">•</button>
                <button className={`toolbar-btn ${activeFormats.insertOrderedList ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); execFormat('insertOrderedList'); }} title="Numbered List">1.</button>
              </div>

              <div className="toolbar-divider" />

              <div className="toolbar-group color-preset-wrapper">
                <button
                  className={`toolbar-btn color-toggle-btn ${showColorPresets ? 'active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); saveSelection(); setShowColorPresets(!showColorPresets); }}
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
                          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); applyPreset(preset, true); setShowColorPresets(false); }}
                          style={{ color: preset.fg, background: preset.bg || 'transparent', borderColor: preset.bg ? preset.bg : preset.fg, position: 'relative' }}
                        >
                          A
                          {assignedKey && (
                            <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 8, color: '#8b949e', lineHeight: 1 }}>{assignedKey}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Single full-width editor */}
            <div className="notes-notebook" onClick={() => showColorPresets && setShowColorPresets(false)}>
              <RichTextEditor
                key={`${selected.noteId}-${selected.subId}`}
                ref={editorRef}
                content={selectedContent || ''}
                placeholder="Start writing..."
                style={{ lineHeight: lineSpacing }}
                onChange={updateSelectedContent}
              />
            </div>
          </>
        ) : (
          <div className="notes-editor-empty">
            <h3>Select a note</h3>
            <p>Select a note from the sidebar or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Notes;
