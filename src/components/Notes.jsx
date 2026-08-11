import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import ReactDOM, { flushSync } from 'react-dom';
import './Notes.css';
import { playTypeSoundThrottled, playClickSound, playAddSound, playDeleteSound } from '../utils/sounds';
import { pushKeyToSupabase } from '../supabase';
import { putImage, getImage, resolveEmbed, newImageId, putStrokes, getStrokes } from '../utils/imageStore';

// Render annotation strokes (normalized 0..1 coords) onto a 2D context of
// css-pixel size W×H. Used by both the note thumbnail and the lightbox.
function drawStrokesOn(ctx, strokes, W, H) {
  if (!strokes || !strokes.length) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of strokes) {
    const pts = st.pts;
    if (!pts || pts.length < 2) continue;
    ctx.strokeStyle = st.c;
    ctx.lineWidth = Math.max(0.75, st.s * W);
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
    ctx.stroke();
  }
}

// Plain-text bullet marker used by the "- " autoformat below: two
// non-breaking spaces (regular spaces at the start of a line get collapsed
// away by normal HTML whitespace rules) plus the bullet glyph and a space.
const BULLET_PREFIX = '  • ';

// "- " at the start of an otherwise-empty line autoformats into a bullet list
// (Notion/Bear-style). Returns the text from the start of the current block
// up to the caret, so the caller can check it's EXACTLY "-" — never fires
// mid-sentence (e.g. "5 - 3" or "well - actually") since a dash anywhere but
// the very first character of the line fails that check.
function getLineTextBeforeCaret(range, editorEl) {
  let block = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  while (block && block !== editorEl) {
    const display = window.getComputedStyle(block).display;
    if (display === 'block' || display === 'list-item') break;
    block = block.parentElement;
  }
  if (!block) block = editorEl;
  const preRange = document.createRange();
  preRange.selectNodeContents(block);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString();
}

function rgbToHex(rgb) {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
}

const NOTE_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
  '#667eea', '#06b6d4', '#e2e8f0', '#d4a017',
];

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

function stripLargeImages(html) {
  if (!html) return html;
  // Only strip images larger than ~300KB (400000 base64 chars) — crash-causing PNGs
  return html.replace(/data-img="data:[^"]{400000,}"/g, 'data-img=""');
}

function migrateHtml(html) {
  if (!html) return html;
  let out = stripLargeImages(html);
  out = out.replace(/color:\s*(#[0-9a-fA-F]{6})/g, (m, c) => {
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

const RichTextEditor = forwardRef(({ content, placeholder, onChange, style, onPasteImage }, ref) => {
  const editorRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(!content);
  const [pendingImg, setPendingImg] = useState(null); // { dataUrl, anchorRect }
  const [pendingTitle, setPendingTitle] = useState('Screenshot');
  const [preview, setPreview] = useState(null); // { dataUrl, rect }
  const [lightbox, setLightbox] = useState(null); // { dataUrl }
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [embedHover, setEmbedHover] = useState(null); // { el, rect }
  const pendingRangeRef = useRef(null);
  const titleInputRef = useRef(null);
  const previewPinnedRef = useRef(false);
  const embedDeleteHoveredRef = useRef(false);
  const lastPasteRef = useRef(0);
  const draggedEmbedRef = useRef(null);
  // Set by onKeyDown when Enter is pressed on a bullet line, consumed by the
  // very next onInput once the browser's own native Enter has finished
  // creating the new line — see the bullet-continuation comment below.
  const pendingBulletRef = useRef(false);

  // Custom undo/redo history
  const historyRef = useRef([content || '']);
  const historyIndexRef = useRef(0);
  const saveTimerRef = useRef(null);
  // Always-current onChange so the debounced flush / unmount cleanup never
  // syncs to a stale note.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const pushHistory = useCallback((html) => {
    const h = historyRef.current.slice(0, historyIndexRef.current + 1);
    if (h[h.length - 1] === html) return;
    h.push(html);
    if (h.length > 200) h.shift();
    historyRef.current = h;
    historyIndexRef.current = h.length - 1;
  }, []);

  const moveCursorToEnd = () => {
    if (!editorRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content || '';
      setIsEmpty(!content);
    }
  }, []);

  useEffect(() => {
    if (pendingImg) setTimeout(() => { titleInputRef.current?.focus(); titleInputRef.current?.select(); }, 0);
  }, [pendingImg]);

  // Read the editor's innerHTML (which serializes the whole note — expensive for
  // image notes) and sync it up. Debounced so typing stays at native speed; the
  // contenteditable is uncontrolled, so deferring the sync never lags the caret.
  const flushInput = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onChangeRef.current(html);
    pushHistory(html);
  }, [pushHistory]);

  const handleInput = () => {
    playTypeSoundThrottled();
    if (!editorRef.current) return;
    // The browser just finished its own native Enter (new line created,
    // caret already inside it) — now it's safe to type the bullet marker
    // into that line. Doing this here (vs. building the line by hand in
    // onKeyDown) means the actual line-splitting is 100% native browser
    // behavior, identical to every other Enter press in this editor.
    // Uses plain Range/Text DOM calls, not execCommand('insertText') — that
    // worked for the FIRST continued line but silently did nothing for the
    // second one onward, the same class of execCommand unreliability as
    // insertUnorderedList earlier. Direct DOM calls have been reliable every
    // time (see the dash-to-bullet swap above), so this uses those instead.
    if (pendingBulletRef.current) {
      pendingBulletRef.current = false;
      const sel = window.getSelection();
      if (sel && sel.rangeCount && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        let textNode, caretOffset;
        if (node.nodeType === Node.TEXT_NODE) {
          node.insertData(range.startOffset, BULLET_PREFIX);
          textNode = node;
          caretOffset = range.startOffset + BULLET_PREFIX.length;
        } else {
          // Caret sits at an element position — a freshly created empty line
          // is usually just <div><br></div>, caret at (div, 0).
          textNode = document.createTextNode(BULLET_PREFIX);
          const refNode = node.childNodes[range.startOffset] || null;
          node.insertBefore(textNode, refNode);
          if (refNode && refNode.nodeName === 'BR') refNode.remove();
          caretOffset = BULLET_PREFIX.length;
        }
        const caret = document.createRange();
        caret.setStart(textNode, caretOffset);
        caret.collapse(true);
        sel.removeAllRanges();
        sel.addRange(caret);
      }
    }
    // cheap, immediate — keeps the placeholder state in sync without serializing
    setIsEmpty(!editorRef.current.textContent?.trim());
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushInput, 350);
  };

  // Flush any pending edit when the editor unmounts (note switch) so nothing
  // typed within the debounce window is lost.
  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (editorRef.current) onChangeRef.current(editorRef.current.innerHTML);
    }
  }, []);

  const insertImageEmbed = (dataUrl, title) => {
    if (!dataUrl) return; // still loading
    const range = pendingRangeRef.current;
    if (!range) return;
    const span = document.createElement('span');
    span.className = 'note-img-embed';
    span.contentEditable = 'false';
    // Store the heavy base64 in IndexedDB; keep only a tiny id in the note HTML
    // so the serialized/synced notes payload stays small.
    const imgId = newImageId();
    putImage(imgId, dataUrl);
    span.setAttribute('data-img-id', imgId);
    span.textContent = title.trim() || 'Screenshot';
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
    if (editorRef.current) { setIsEmpty(false); const html = editorRef.current.innerHTML; onChange(html); pushHistory(html); }
  };

  // Pasted images become free-floating canvas items (draggable anywhere over
  // the note) instead of inline chips in the text.
  const handlePaste = (e) => {
    const now = Date.now();
    if (now - lastPasteRef.current < 600) return;
    lastPasteRef.current = now;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file || !onPasteImage) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const imgEl = new window.Image();
      imgEl.onload = () => {
        const maxW = 1280;
        const scale = imgEl.width > maxW ? maxW / imgEl.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(imgEl.width * scale);
        canvas.height = Math.round(imgEl.height * scale);
        canvas.getContext('2d').drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        onPasteImage(canvas.toDataURL('image/jpeg', 0.75));
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
      if (embed) {
        previewElRef.current = embed;
        setPreview({ dataUrl: null, x: e.clientX, y: e.clientY, el: embed });
        setEmbedHover({ el: embed, rect: embed.getBoundingClientRect() });
        // resolve from IndexedDB (cached after first hover); ignore if user moved on
        resolveEmbed(embed).then(url => {
          setPreview(prev => (prev && prev.el === embed) ? { ...prev, dataUrl: url } : prev);
        });
      }
    };
    const onMove = (e) => {
      const embed = e.target.closest?.('.note-img-embed');
      if (embed) {
        setPreview(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
        setEmbedHover({ el: embed, rect: embed.getBoundingClientRect() });
      }
    };
    const onOut = (e) => {
      if (e.target.closest?.('.note-img-embed')) {
        if (!previewPinnedRef.current) setPreview(null);
        setTimeout(() => { if (!embedDeleteHoveredRef.current) setEmbedHover(null); }, 50);
      }
    };
    const onClick = (e) => {
      // tıklama artık lightbox açmıyor — büyütme butonu ile açılıyor
    };
    // Custom mouse-based drag (HTML5 drag API unreliable in WebView2)
    let ghostEl = null;
    let pendingEmbed = null;
    let dragging = false;
    let startX = 0, startY = 0;

    const onMouseDown = (e) => {
      const embed = e.target.closest?.('.note-img-embed');
      if (!embed) return;
      e.preventDefault();
      e.stopPropagation();
      pendingEmbed = embed;
      startX = e.clientX;
      startY = e.clientY;
      dragging = false;

      const onMove = (ev) => {
        if (!dragging) {
          if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
          dragging = true;
          draggedEmbedRef.current = pendingEmbed;
          pendingEmbed.style.opacity = '0.3';

          ghostEl = document.createElement('div');
          ghostEl.className = 'note-embed-drag-ghost';
          ghostEl.textContent = pendingEmbed.textContent;
          document.body.appendChild(ghostEl);
        }
        if (ghostEl) {
          ghostEl.style.left = ev.clientX + 10 + 'px';
          ghostEl.style.top = ev.clientY - 12 + 'px';
        }
      };

      const onUp = (ev) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (ghostEl) { ghostEl.remove(); ghostEl = null; }
        const embedEl = draggedEmbedRef.current;
        if (embedEl) embedEl.style.opacity = '';
        draggedEmbedRef.current = null;
        pendingEmbed = null;
        if (!dragging || !embedEl) { dragging = false; return; }
        dragging = false;

        let range = null;
        if (document.caretRangeFromPoint) {
          range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
        } else if (document.caretPositionFromPoint) {
          const pos = document.caretPositionFromPoint(ev.clientX, ev.clientY);
          if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
        }
        if (range && !embedEl.contains(range.startContainer)) {
          embedEl.parentNode?.removeChild(embedEl);
          range.insertNode(embedEl);
        }
        setEmbedHover(null);
        setPreview(null);
        if (editorRef.current) {
          const html = editorRef.current.innerHTML;
          onChange(html);
          pushHistory(html);
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    editor.addEventListener('mouseover', onOver);
    editor.addEventListener('mousemove', onMove);
    editor.addEventListener('mouseout', onOut);
    editor.addEventListener('click', onClick);
    editor.addEventListener('mousedown', onMouseDown);
    return () => {
      editor.removeEventListener('mouseover', onOver);
      editor.removeEventListener('mousemove', onMove);
      editor.removeEventListener('mouseout', onOut);
      editor.removeEventListener('click', onClick);
      editor.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  // Esc closes lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const previewElRef = useRef(null);
  const deleteEmbed = (el) => {
    const target = el || previewElRef.current;
    target?.remove();
    previewPinnedRef.current = false;
    embedDeleteHoveredRef.current = false;
    previewElRef.current = null;
    setPreview(null);
    setEmbedHover(null);
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
        onBlur={flushInput}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z';
          const isRedo = (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'));
          if (isUndo) {
            e.preventDefault();
            if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); pushHistory(editorRef.current?.innerHTML || ''); }
            if (historyIndexRef.current > 0) {
              historyIndexRef.current--;
              const html = historyRef.current[historyIndexRef.current];
              editorRef.current.innerHTML = html;
              setIsEmpty(!editorRef.current.textContent?.trim());
              onChange(html);
              moveCursorToEnd();
            }
          } else if (isRedo) {
            e.preventDefault();
            if (historyIndexRef.current < historyRef.current.length - 1) {
              historyIndexRef.current++;
              const html = historyRef.current[historyIndexRef.current];
              editorRef.current.innerHTML = html;
              setIsEmpty(!editorRef.current.textContent?.trim());
              onChange(html);
              moveCursorToEnd();
            }
          } else if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || !sel.isCollapsed || !editorRef.current) return;
            const range = sel.getRangeAt(0);
            const container = range.startContainer;
            if (container.nodeType !== Node.TEXT_NODE || range.startOffset < 1) return;
            if (container.textContent[range.startOffset - 1] !== '-') return;
            if (getLineTextBeforeCaret(range, editorRef.current) !== '-') return;
            e.preventDefault();

            // Swap just the "-" character for an indented bullet glyph, in
            // place, inside the SAME text node — nothing else in the note is
            // read, restructured, or touched. (An earlier version rebuilt the
            // line as a real <ul><li>, but finding "the line's container" to
            // replace was unreliable across this editor's varied DOM shapes
            // and once wiped out several preceding lines — this can't do that,
            // since it's a single in-place character edit.)
            const dashOffset = range.startOffset - 1;
            container.replaceData(dashOffset, 1, BULLET_PREFIX);
            const caret = document.createRange();
            caret.setStart(container, dashOffset + BULLET_PREFIX.length);
            caret.collapse(true);
            sel.removeAllRanges();
            sel.addRange(caret);

            flushInput();
          } else if (e.key === '-' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // 4+ dashes in a row on their own line become a horizontal rule
            // (paragraph divider). Triggers the moment the 4th dash would
            // land, same "whole line so far must be exactly this pattern"
            // safety as the bullet swap above.
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || !sel.isCollapsed || !editorRef.current) return;
            const range = sel.getRangeAt(0);
            const container = range.startContainer;
            if (container.nodeType !== Node.TEXT_NODE) return;
            const editorEl = editorRef.current;
            const lineText = getLineTextBeforeCaret(range, editorEl);
            if (!/^-{3,}$/.test(lineText)) return;
            const dashStart = range.startOffset - lineText.length;
            if (dashStart < 0 || container.textContent.slice(dashStart, range.startOffset) !== lineText) return;
            e.preventDefault();

            // Remove just the dash run from this text node — same surgical,
            // single-node edit as the bullet swap, so nothing else in the
            // note is ever touched. The <hr> is only ever INSERTED next to
            // the (now empty) line, never replacing or removing it, so it
            // can't wipe out neighboring content the way an early attempt at
            // the bullet feature once did.
            container.deleteData(dashStart, lineText.length);
            let block = container.parentElement;
            while (block && block !== editorEl) {
              const display = window.getComputedStyle(block).display;
              if (display === 'block' || display === 'list-item') break;
              block = block.parentElement;
            }
            const hr = document.createElement('hr');
            if (!block || block === editorEl) editorEl.insertBefore(hr, container);
            else block.before(hr);

            const caret = document.createRange();
            caret.setStart(container, dashStart);
            caret.collapse(true);
            sel.removeAllRanges();
            sel.addRange(caret);

            flushInput();
          } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Continue the bullet on the next line, same as Notion/Bear. Two
            // hand-built approaches (a manual <ul><li> rebuild, then a manual
            // <div> line) each broke in different ways across this editor's
            // varied DOM shapes. This no longer builds anything by hand: it
            // just flags the line and lets the browser's own native Enter
            // create the new line exactly as it always does; handleInput
            // (below) types the bullet marker into it right after.
            const sel = window.getSelection();
            if (sel && sel.rangeCount && sel.isCollapsed && editorRef.current) {
              const range = sel.getRangeAt(0);
              const lineText = getLineTextBeforeCaret(range, editorRef.current);
              if (lineText.startsWith(BULLET_PREFIX)) pendingBulletRef.current = true;
            }
          }
        }}
        data-placeholder={placeholder}
        style={style}
      />

      {/* Title input overlay — appears at cursor right after paste */}
      {pendingImg && (
        <div className="note-img-title-overlay" style={{ top: pendingImg.anchorRect.top, left: pendingImg.anchorRect.left }}>
          <input
            ref={titleInputRef}
            className="note-img-title-input"
            value={pendingTitle}
            onChange={e => setPendingTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); insertImageEmbed(pendingImg.dataUrl, pendingTitle); }
              if (e.key === 'Escape') { setPendingImg(null); pendingRangeRef.current = null; }
            }}
            placeholder="Başlık yaz, Enter'a bas..."
          />
          <button className="note-img-title-confirm" onClick={() => insertImageEmbed(pendingImg.dataUrl, pendingTitle)}>↵</button>
        </div>
      )}

      {/* Hover preview — above cursor if space, else below */}
      {preview && (
        <div className="note-img-preview" style={{
          ...(preview.y > 450
            ? { bottom: window.innerHeight - preview.y + 14 }
            : { top: preview.y + 20 }),
          left: Math.min(Math.max(8, preview.x - 8), window.innerWidth - 656),
        }}>
          {preview.dataUrl
            ? <img src={preview.dataUrl} className="note-img-preview-img" alt="" />
            : <div className="note-img-preview-img note-img-preview-loading" />}
          <button
            className="note-img-delete-btn"
            onMouseEnter={() => { previewPinnedRef.current = true; }}
            onMouseLeave={() => { previewPinnedRef.current = false; setPreview(null); }}
            onClick={(e) => { e.stopPropagation(); deleteEmbed(preview.el); }}
            title="Sil"
          >×</button>
        </div>
      )}

      {/* Embed chip buttons — appears top-right of chip on hover */}
      {embedHover && ReactDOM.createPortal(
        <div
          style={{ position: 'fixed', top: embedHover.rect.top - 9, left: embedHover.rect.right - 36, display: 'flex', gap: 3, pointerEvents: 'auto' }}
          onMouseEnter={() => { embedDeleteHoveredRef.current = true; }}
          onMouseLeave={() => { embedDeleteHoveredRef.current = false; setEmbedHover(null); }}
        >
          <button
            className="note-embed-chip-btn zoom"
            onClick={(e) => { e.stopPropagation(); const el = embedHover.el; resolveEmbed(el).then(url => { setLightbox({ dataUrl: url }); setLightboxZoom(1); }); }}
            title="Büyüt"
          >⤢</button>
          <button
            className="note-embed-chip-btn delete"
            onClick={(e) => { e.stopPropagation(); deleteEmbed(embedHover.el); }}
            title="Sil"
          >×</button>
        </div>,
        document.body
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

function sanitizeNotes(notes) {
  return notes.map(n => ({
    ...n,
    content: stripLargeImages(n.content || ''),
    subNotes: (n.subNotes || []).map(s => ({ ...s, content: stripLargeImages(s.content || '') })),
  }));
}

// Move any inline base64 image (legacy `data-img="data:..."`) into IndexedDB and
// leave only a `data-img-id` reference behind, so the note HTML stays tiny.
async function externalizeImages(html) {
  if (!html || html.indexOf('data-img="data:') === -1) return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  for (const span of tmp.querySelectorAll('.note-img-embed')) {
    const legacy = span.getAttribute('data-img');
    if (legacy && legacy.startsWith('data:')) {
      const id = newImageId();
      await putImage(id, legacy);
      span.removeAttribute('data-img');
      span.setAttribute('data-img-id', id);
    }
  }
  return tmp.innerHTML;
}

// Canvas images: strip inline dataUrl/strokes (from an imported backup) into IndexedDB
async function externalizeCanvasImages(arr) {
  if (!Array.isArray(arr)) return arr;
  const out = [];
  for (const ci of arr) {
    if (ci && (ci.dataUrl || ci.strokes)) {
      const imgId = ci.imgId || newImageId();
      if (ci.dataUrl) await putImage(imgId, ci.dataUrl);
      if (ci.strokes) await putStrokes(imgId, ci.strokes);
      const { dataUrl, strokes, ...rest } = ci;
      out.push({ ...rest, imgId });
    } else out.push(ci);
  }
  return out;
}

async function externalizeNotes(notesArr) {
  const out = [];
  for (const n of notesArr) {
    const content = await externalizeImages(n.content);
    const canvasImages = await externalizeCanvasImages(n.canvasImages);
    const subNotes = [];
    for (const s of (n.subNotes || [])) {
      subNotes.push({ ...s, content: await externalizeImages(s.content), canvasImages: await externalizeCanvasImages(s.canvasImages) });
    }
    out.push({ ...n, content, subNotes, ...(canvasImages ? { canvasImages } : {}) });
  }
  return out;
}

// Reverse of externalize: pull images back from IndexedDB into the HTML so an
// exported backup file is self-contained.
async function inlineImages(html) {
  if (!html || html.indexOf('data-img-id="') === -1) return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  for (const span of tmp.querySelectorAll('.note-img-embed[data-img-id]')) {
    const url = await getImage(span.getAttribute('data-img-id'));
    if (url) { span.setAttribute('data-img', url); span.removeAttribute('data-img-id'); }
  }
  return tmp.innerHTML;
}

// Canvas images: pull dataUrl + strokes back from IndexedDB so the backup is self-contained
async function inlineCanvasImages(arr) {
  if (!Array.isArray(arr)) return arr;
  const out = [];
  for (const ci of arr) {
    const dataUrl = ci?.imgId ? await getImage(ci.imgId) : null;
    const strokes = ci?.imgId ? await getStrokes(ci.imgId) : null;
    out.push({ ...ci, ...(dataUrl ? { dataUrl } : {}), ...(strokes && strokes.length ? { strokes } : {}) });
  }
  return out;
}

async function inlineNotesForExport(notesArr) {
  const out = [];
  for (const n of notesArr) {
    const content = await inlineImages(n.content);
    const canvasImages = await inlineCanvasImages(n.canvasImages);
    const subNotes = [];
    for (const s of (n.subNotes || [])) {
      subNotes.push({ ...s, content: await inlineImages(s.content), canvasImages: await inlineCanvasImages(s.canvasImages) });
    }
    out.push({ ...n, content, subNotes, ...(canvasImages ? { canvasImages } : {}) });
  }
  return out;
}

// A screenshot pasted onto the note canvas: freely positioned, draggable,
// resizable from the corner, deletable, double-click to zoom. Image bytes live
// in IndexedDB (imageStore); the note only stores { id, imgId, x, y, w }.
function CanvasImage({ img, onCommit, onDelete, onOpen, strokesVersion }) {
  const [src, setSrc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const elRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getImage(img.imgId).then(u => { if (alive) setSrc(u); });
    return () => { alive = false; };
  }, [img.imgId]);

  // Annotations made in the lightbox; re-read when it closes (strokesVersion)
  useEffect(() => {
    let alive = true;
    getStrokes(img.imgId).then(s => { if (alive) setStrokes(s || []); });
    return () => { alive = false; };
  }, [img.imgId, strokesVersion]);

  // Paint the annotations over the thumbnail at its current display size
  useEffect(() => {
    const el = elRef.current, cv = overlayRef.current;
    if (!el || !cv || !loaded) return;
    const raf = requestAnimationFrame(() => {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawStrokesOn(ctx, strokes, W, H);
    });
    return () => cancelAnimationFrame(raf);
  }, [loaded, strokes, img.w]);

  const startDrag = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = elRef.current;
    const startX = e.clientX, startY = e.clientY;
    const origX = img.x, origY = img.y;
    let moved = false;
    const onMove = (me) => {
      const dx = me.clientX - startX, dy = me.clientY - startY;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      el.classList.add('dragging');
      el.style.left = Math.max(0, origX + dx) + 'px';
      el.style.top = Math.max(0, origY + dy) + 'px';
    };
    const onUp = (me) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('dragging');
      if (moved) onCommit({ x: Math.max(0, origX + (me.clientX - startX)), y: Math.max(0, origY + (me.clientY - startY)) });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startResize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = elRef.current;
    const startX = e.clientX;
    const origW = img.w || 340;
    const clampW = (w) => Math.min(1400, Math.max(120, w));
    const onMove = (me) => { el.style.width = clampW(origW + (me.clientX - startX)) + 'px'; };
    const onUp = (me) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onCommit({ w: clampW(origW + (me.clientX - startX)) });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={elRef}
      className="note-canvas-img"
      style={{ left: img.x, top: img.y, width: img.w || 340 }}
      onMouseDown={startDrag}
      onDoubleClick={() => src && onOpen({ imgId: img.imgId, src })}
    >
      {src ? <img src={src} draggable={false} alt="" onLoad={() => setLoaded(true)} /> : <div className="nci-loading" />}
      <canvas ref={overlayRef} className="nci-overlay" />
      <button className="nci-delete" title="Sil" onMouseDown={e => e.stopPropagation()} onClick={onDelete}>×</button>
      <div className="nci-resize" title="Boyutlandır" onMouseDown={startResize} />
      {/* Alt başlık şeridi: varsa hep görünür; yoksa hover'da "+ başlık" */}
      <div
        className={`nci-titlebar${img.title ? '' : ' nci-empty'}`}
        onMouseDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
      >
        {editingTitle ? (
          <input
            className="nci-title-input"
            autoFocus
            defaultValue={img.title || ''}
            placeholder="Başlık yaz..."
            onKeyDown={e => {
              if (e.key === 'Enter') { onCommit({ title: e.target.value.trim() }); setEditingTitle(false); }
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            onBlur={e => { onCommit({ title: e.target.value.trim() }); setEditingTitle(false); }}
          />
        ) : (
          <span className="nci-title-text" onClick={() => setEditingTitle(true)} title="Başlığı düzenle">
            {img.title || '+ başlık'}
          </span>
        )}
      </div>
    </div>
  );
}

const DRAW_COLORS = ['#ff4d4f', '#ffd666', '#52c41a', '#40a9ff', '#ffffff'];

// Zoomed view of a canvas image with a freehand annotation layer. Strokes are
// saved to IndexedDB next to the image (normalized coords), so they persist and
// can be continued on the next open. Clicking anywhere outside the image closes.
function CanvasLightbox({ imgId, src, onClose }) {
  const [imgDim, setImgDim] = useState(null); // natural size
  const [zoom, setZoom] = useState(1);
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [, forceRender] = useState(0);
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    let alive = true;
    getStrokes(imgId).then(s => {
      if (!alive) return;
      strokesRef.current = s || [];
      forceRender(v => v + 1);
    });
    return () => { alive = false; };
  }, [imgId]);

  useEffect(() => {
    const im = new window.Image();
    im.onload = () => setImgDim({ w: im.naturalWidth, h: im.naturalHeight });
    im.src = src;
  }, [src]);

  // Fit to viewport, then apply zoom
  let W = 0, H = 0;
  if (imgDim) {
    const fit = Math.min((window.innerWidth * 0.86) / imgDim.w, (window.innerHeight * 0.8) / imgDim.h, 1);
    W = Math.round(imgDim.w * fit * zoom);
    H = Math.round(imgDim.h * fit * zoom);
  }

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !W) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawStrokesOn(ctx, strokesRef.current, W, H);
  }, [W, H]);

  useEffect(() => { redraw(); });

  const persist = () => { putStrokes(imgId, strokesRef.current); };

  const startStroke = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const toNorm = (ev) => [
      Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
    ];
    const stroke = { c: colorRef.current, s: 3 / (rect.width / zoom), pts: [toNorm(e)] };
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.c;
    ctx.lineWidth = Math.max(0.75, stroke.s * rect.width);

    const onMove = (me) => {
      const p = toNorm(me);
      const prev = stroke.pts[stroke.pts.length - 1];
      stroke.pts.push(p);
      ctx.beginPath();
      ctx.moveTo(prev[0] * rect.width, prev[1] * rect.height);
      ctx.lineTo(p[0] * rect.width, p[1] * rect.height);
      ctx.stroke();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (stroke.pts.length >= 2) {
        strokesRef.current = [...strokesRef.current, stroke];
        persist();
      }
      redraw();
      forceRender(v => v + 1); // Geri al butonu hemen aktifleşsin
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const undo = useCallback(() => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    putStrokes(imgId, strokesRef.current);
    redraw();
    forceRender(v => v + 1);
  }, [imgId, redraw]);

  // Ctrl+Z → son çizgiyi geri al
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo]);
  const clearAll = () => {
    strokesRef.current = [];
    persist();
    redraw();
    forceRender(v => v + 1);
  };

  return (
    <div
      className="note-img-lightbox ncl-root"
      onClick={onClose}
      onWheel={e => { e.preventDefault(); setZoom(z => Math.min(6, Math.max(0.25, z - e.deltaY * 0.001))); }}
    >
      <div className="ncl-toolbar" onClick={e => e.stopPropagation()}>
        {DRAW_COLORS.map(c => (
          <button
            key={c}
            className={`ncl-color${color === c ? ' active' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
        <span className="ncl-sep" />
        <button className="ncl-btn" onClick={undo} disabled={!strokesRef.current.length}>↶ Geri al</button>
        <button className="ncl-btn" onClick={clearAll} disabled={!strokesRef.current.length}>Temizle</button>
        <span className="ncl-sep" />
        <span className="ncl-zoom">{Math.round(zoom * 100)}%</span>
        <button className="ncl-btn" onClick={onClose}>✕</button>
      </div>
      {imgDim && (
        <div className="ncl-stage" style={{ width: W, height: H }} onClick={e => e.stopPropagation()}>
          <img src={src} width={W} height={H} draggable={false} alt="" />
          <canvas
            ref={canvasRef}
            style={{ width: W, height: H }}
            className="ncl-draw"
            onMouseDown={startStroke}
          />
        </div>
      )}
    </div>
  );
}

// FLIP animation (First-Last-Invert-Play) so a drag-reorder glides rows into
// their new spot instead of snapping — same technique the todo list drag uses.
// Captures every tree row's position, applies the reorder synchronously
// (flushSync so the DOM is already updated when we measure "after"), then
// animates from the old position to the new one.
function flipAnimateRows(mutateFn) {
  const rowKey = (el) => el.hasAttribute('data-sub-id')
    ? `s${el.getAttribute('data-sub-id')}`
    : `n${el.getAttribute('data-note-id')}`;

  const before = {};
  document.querySelectorAll('.notes-tree-row[data-note-id], .notes-tree-row[data-sub-id]').forEach(el => {
    before[rowKey(el)] = el.getBoundingClientRect();
  });

  flushSync(mutateFn);

  document.querySelectorAll('.notes-tree-row[data-note-id], .notes-tree-row[data-sub-id]').forEach(el => {
    const b = before[rowKey(el)];
    if (!b) return;
    const after = el.getBoundingClientRect();
    const dy = b.top - after.top;
    const dx = b.left - after.left;
    if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  requestAnimationFrame(() => {
    document.querySelectorAll('.notes-tree-row[data-note-id], .notes-tree-row[data-sub-id]').forEach(el => {
      if (!el.style.transform) return;
      el.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.transform = '';
      const done = () => { el.style.transition = ''; el.style.transform = ''; el.removeEventListener('transitionend', done); };
      el.addEventListener('transitionend', done);
    });
  });
}

function Notes() {
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('notes');
    const backup = localStorage.getItem('notes_local_backup');
    const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
    const a = parse(saved), b = parse(backup);
    const raw = (a && b) ? (a.length >= b.length ? a : b) : (a || b || []);
    return sanitizeNotes(raw.map(migrateNote));
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
  const [canvasBg, setCanvasBg] = useState(() => localStorage.getItem('notesCanvasBg') || 'none');
  const [lineSpacing, setLineSpacing] = useState(() => {
    const v = parseFloat(localStorage.getItem('notesLineSpacing') || '1.7');
    return Math.round(v * 10) / 10;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    return parseInt(localStorage.getItem('notesSidebarWidth') || '240');
  });
  const [showMenu, setShowMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { noteId, subId? }
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [colorPickerNote, setColorPickerNote] = useState(null);

  const sidebarRef = useRef(null);
  const editorRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const notesSaveTimerRef = useRef(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const isResizingRef = useRef(false);
  const toolbarRef = useRef(null);
  const editorScrollRef = useRef(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (notes.length === 0) return;
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = setTimeout(() => {
      const serialized = JSON.stringify(notes);
      localStorage.setItem('notes', serialized);
      localStorage.setItem('notes_local_backup', serialized);
    }, 2000);
  }, [notes]);

  // One-time migration: move any legacy inline base64 images into IndexedDB so
  // the live notes payload (serialized + synced on every change) stays tiny.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    let cancelled = false;
    (async () => {
      const hasInline = notes.some(n =>
        (n.content || '').indexOf('data-img="data:') !== -1 ||
        (n.subNotes || []).some(s => (s.content || '').indexOf('data-img="data:') !== -1));
      if (!hasInline) return;
      const migrated = await externalizeNotes(notes);
      if (!cancelled) setNotes(migrated);
    })();
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    if (!colorPickerNote) return;
    const close = () => setColorPickerNote(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [colorPickerNote]);

  useEffect(() => {
    setAnimKey(k => k + 1);
  }, [selected?.noteId, selected?.subId]);

  useEffect(() => {
    const container = editorScrollRef.current;
    const toolbar = toolbarRef.current;
    if (!container || !toolbar) return;
    const onScroll = () => toolbar.classList.toggle('scrolled', container.scrollTop > 10);
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [animKey]);

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

  // Reordering only ever moves entries within their own array (splice out,
  // splice back in) — every note/subNote object passes through untouched, so
  // titles/content/images can never be altered or lost by a drag.
  const moveNote = (draggedId, targetId) => {
    if (draggedId === targetId) return;
    setNotes(prev => {
      const fromIdx = prev.findIndex(n => n.id === draggedId);
      const toIdx = prev.findIndex(n => n.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const moveSubNote = (noteId, draggedSubId, targetSubId) => {
    if (draggedSubId === targetSubId) return;
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const subs = n.subNotes || [];
      const fromIdx = subs.findIndex(s => s.id === draggedSubId);
      const toIdx = subs.findIndex(s => s.id === targetSubId);
      if (fromIdx === -1 || toIdx === -1) return n;
      const nextSubs = [...subs];
      const [moved] = nextSubs.splice(fromIdx, 1);
      nextSubs.splice(toIdx, 0, moved);
      return { ...n, subNotes: nextSubs };
    }));
  };

  // Custom mouse-based drag (HTML5 drag API is unreliable in this WebView2
  // app — same reasoning as the image-embed drag above): grabbing the handle
  // only reorders among rows of the same kind/parent, so a note can never be
  // dropped into another note's sub-list by accident.
  const startTreeDrag = (e, kind, id, parentNoteId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rowEl = e.currentTarget.closest('.notes-tree-row');
    if (!rowEl) return;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    let overEl = null;

    const onMove = (ev) => {
      if (!moved) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
        moved = true;
        rowEl.classList.add('notes-row-dragging');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetRow = el?.closest(kind === 'note' ? '.notes-tree-row[data-note-id]' : '.notes-tree-row[data-sub-id]');
      let valid = null;
      if (targetRow && targetRow !== rowEl) {
        if (kind === 'note') {
          const targetId = Number(targetRow.getAttribute('data-note-id'));
          if (targetId !== id) valid = targetRow;
        } else {
          const targetParent = Number(targetRow.getAttribute('data-parent-id'));
          const targetId = Number(targetRow.getAttribute('data-sub-id'));
          if (targetParent === parentNoteId && targetId !== id) valid = targetRow;
        }
      }
      if (overEl !== valid) {
        if (overEl) overEl.classList.remove('notes-row-drop-target');
        if (valid) valid.classList.add('notes-row-drop-target');
        overEl = valid;
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      rowEl.classList.remove('notes-row-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (overEl) {
        overEl.classList.remove('notes-row-drop-target');
        const targetId = kind === 'note'
          ? Number(overEl.getAttribute('data-note-id'))
          : Number(overEl.getAttribute('data-sub-id'));
        flipAnimateRows(() => {
          if (kind === 'note') moveNote(id, targetId);
          else moveSubNote(parentNoteId, id, targetId);
        });
        playClickSound();
      }
      overEl = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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
      if (filePath) {
        const exportable = await inlineNotesForExport(notes);
        await writeTextFile(filePath, JSON.stringify(exportable, null, 2));
      }
    } catch (e) { console.error('Export error:', e); }
  };

  const contentToHtml = async (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    const spans = [...tmp.querySelectorAll('.note-img-embed')];
    for (const span of spans) {
      const dataUrl = await resolveEmbed(span);
      const label = span.textContent.trim();
      const fig = document.createElement('figure');
      fig.style.cssText = 'margin:12px 0;';
      const img = document.createElement('img');
      if (dataUrl) img.src = dataUrl;
      img.alt = label;
      img.style.cssText = 'max-width:100%;border-radius:6px;display:block;';
      const cap = document.createElement('figcaption');
      cap.style.cssText = 'font-size:11px;color:#888;margin-top:4px;';
      cap.textContent = label;
      fig.appendChild(img);
      fig.appendChild(cap);
      span.parentNode?.replaceChild(fig, span);
    }
    return tmp.innerHTML;
  };

  const exportAsHtml = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const date = new Date().toISOString().slice(0, 10);
      const filePath = await save({
        defaultPath: `notlar-${date}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (!filePath) return;

      const renderSection = async (title, content, level = 2) =>
        `<section><h${level}>${title || 'Untitled'}</h${level}><div class="content">${await contentToHtml(content)}</div></section>`;

      const sections = [];
      for (const n of notes) {
        let html = await renderSection(n.title, n.content);
        for (const s of (n.subNotes || [])) html += await renderSection(s.title, s.content, 3);
        sections.push(html);
      }
      const body = sections.join('<hr>');

      const fullHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>BankoSpace Notlar — ${date}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 24px;color:#222;line-height:1.7;}
  h2{font-size:22px;margin:32px 0 8px;border-bottom:2px solid #eee;padding-bottom:6px;}
  h3{font-size:17px;margin:24px 0 6px;color:#444;}
  .content{margin-bottom:20px;}
  img{max-width:100%;border-radius:6px;margin:8px 0;}
  figure{margin:12px 0;}
  figcaption{font-size:11px;color:#888;}
  hr{border:none;border-top:2px solid #eee;margin:40px 0;}
  ul,ol{padding-left:24px;}
</style>
</head>
<body>
${body}
</body>
</html>`;
      await writeTextFile(filePath, fullHtml);
    } catch (e) { console.error('HTML export error:', e); }
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
      // Pull any inline base64 from the backup into IndexedDB so the live
      // payload stays small.
      const externalized = await externalizeNotes(imported.map(migrateNote));
      setNotes(externalized);
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
  const selectedCanvasImages = (selectedSub ? selectedSub.canvasImages : selectedNote?.canvasImages) || [];

  // Apply fn to the selected note/subnote's canvasImages array
  const patchSelectedCanvas = (fn) => {
    if (!selected) return;
    setNotes(prev => prev.map(n => {
      if (n.id !== selected.noteId) return n;
      if (selected.subId === null) return { ...n, canvasImages: fn(n.canvasImages || []), updatedAt: new Date().toISOString() };
      return {
        ...n,
        subNotes: n.subNotes.map(s => s.id === selected.subId ? { ...s, canvasImages: fn(s.canvasImages || []) } : s),
        updatedAt: new Date().toISOString(),
      };
    }));
  };

  // Pasted screenshot → store bytes in IndexedDB, drop a floating item onto the
  // canvas near the current scroll position (slight cascade so they don't stack).
  const addCanvasImage = async (dataUrl) => {
    const imgId = newImageId();
    await putImage(imgId, dataUrl);
    const scrollTop = editorScrollRef.current?.scrollTop || 0;
    const count = selectedCanvasImages.length;
    patchSelectedCanvas(arr => [...arr, {
      id: Date.now(),
      imgId,
      x: 60 + (count % 6) * 32,
      y: scrollTop + 60 + (count % 6) * 32,
      w: 340,
    }]);
  };

  const [canvasLightbox, setCanvasLightbox] = useState(null); // { imgId, src } | null
  const [strokesVersion, setStrokesVersion] = useState(0);
  useEffect(() => {
    // Lightbox kapanınca küçük görseller çizimleri yeniden yüklesin
    if (!canvasLightbox) { setStrokesVersion(v => v + 1); return; }
    const onKey = (e) => { if (e.key === 'Escape') setCanvasLightbox(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canvasLightbox]);

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
                  onClick={() => { setShowMenu(false); exportAsHtml(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', fontSize: 13 }}
                  onMouseEnter={e => e.target.style.background = '#21262d'}
                  onMouseLeave={e => e.target.style.background = 'none'}
                >↓ Export (HTML + Görseller)</button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { setShowMenu(false); exportAllNotes(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', fontSize: 13 }}
                  onMouseEnter={e => e.target.style.background = '#21262d'}
                  onMouseLeave={e => e.target.style.background = 'none'}
                >↓ Export (JSON — yedek)</button>
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
                  style={{ '--note-color': note.color || '#667eea' }}
                  data-note-id={note.id}
                  onClick={() => setSelected({ noteId: note.id, subId: null })}
                >
                  <span
                    className="notes-tree-drag-handle"
                    title="Sürükle - sırayı değiştir"
                    onMouseDown={e => startTreeDrag(e, 'note', note.id, null)}
                    onClick={e => e.stopPropagation()}
                  >⠿</span>
                  <span className="notes-tree-bar" style={{ background: note.color || '#667eea' }} />
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
                      className="notes-tree-color-btn"
                      title="Renk değiştir"
                      style={{ background: note.color || '#667eea' }}
                      onClick={e => { e.stopPropagation(); setColorPickerNote(v => v === note.id ? null : note.id); }}
                    />
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
                  {colorPickerNote === note.id && (
                    <div className="notes-color-picker" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                      {NOTE_COLORS.map(c => (
                        <button
                          key={c}
                          className={`notes-color-swatch-btn${note.color === c ? ' active' : ''}`}
                          style={{ background: c }}
                          onClick={() => { setNotes(prev => prev.map(n => n.id === note.id ? { ...n, color: c } : n)); setColorPickerNote(null); }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Sub notes */}
                {expandedNotes.has(note.id) && note.subNotes?.map((sub, si) => (
                  <div
                    key={sub.id}
                    className={`notes-tree-row notes-sub-row${selected?.noteId === note.id && selected?.subId === sub.id ? ' active' : ''}`}
                    style={{ '--note-color': note.color || '#667eea' }}
                    data-sub-id={sub.id}
                    data-parent-id={note.id}
                    onClick={() => setSelected({ noteId: note.id, subId: sub.id })}
                  >
                    <span
                      className="notes-tree-drag-handle"
                      title="Sürükle - sırayı değiştir"
                      onMouseDown={e => startTreeDrag(e, 'sub', sub.id, note.id)}
                      onClick={e => e.stopPropagation()}
                    >⠿</span>
                    <span className="notes-tree-bar" style={{ background: note.color || '#667eea', opacity: 0.55 }} />
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
      <div className="notes-editor" style={selectedNote ? { '--note-color': selectedNote.color || '#667eea' } : {}}>
        {selectedNote ? (
          <div ref={editorScrollRef} key={animKey} className="notes-editor-fade">
            <div className="notes-editor-header">
              <input
                className="notes-title-input"
                placeholder="title..."
                value={selectedTitle || ''}
                onChange={e => updateTitle(e.target.value)}
              />
            </div>

            {/* Formatting Toolbar */}
            <div className="notes-formatting-toolbar" ref={toolbarRef}>
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
                <select
                  className="toolbar-select"
                  onMouseDown={e => e.stopPropagation()}
                  value={canvasBg}
                  onChange={e => {
                    setCanvasBg(e.target.value);
                    localStorage.setItem('notesCanvasBg', e.target.value);
                  }}
                  title="Canvas arka planı"
                >
                  <option value="none">Düz</option>
                  <option value="lines">Çizgili</option>
                  <option value="dots">Noktalı</option>
                  <option value="grid">Damalı</option>
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

              <div className="toolbar-divider" />

              <div className="toolbar-group" style={{ position: 'relative' }}>
                <button
                  className={`toolbar-btn ${showShortcuts ? 'active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); saveSelection(); setShowShortcuts(v => !v); setShowColorPresets(false); }}
                  title="Kısayollar"
                >⌨</button>
                {showShortcuts && (
                  <div className="notes-shortcuts-panel">
                    <div className="notes-shortcuts-title">Kısayollar</div>
                    {[
                      ['Ctrl+Z', 'Geri al'],
                      ['Ctrl+Y', 'Yinele'],
                      ['Ctrl+Shift+Z', 'Yinele'],
                      ['Ctrl+B', 'Kalın'],
                      ['Ctrl+I', 'İtalik'],
                      ['Ctrl+U', 'Altı çizili'],
                      ['Ctrl+V', 'Görsel / ekran görüntüsü yapıştır'],
                      ['Alt+1–9', 'Renk kısayolu uygula'],
                      ["Alt+' veya \"", 'Rengi sıfırla'],
                    ].map(([key, desc]) => (
                      <div key={key} className="notes-shortcut-row">
                        <kbd className="notes-shortcut-key">{key}</kbd>
                        <span className="notes-shortcut-desc">{desc}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Single full-width editor — also the canvas for floating images */}
            <div
              className={`notes-notebook nb-bg-${canvasBg}`}
              style={{
                // Desenler metnin gerçek satır yüksekliğiyle hizalanır (editör font 15.5px)
                '--nb-line-h': `${(15.5 * lineSpacing).toFixed(2)}px`,
                ...(selectedCanvasImages.length ? { minHeight: Math.max(...selectedCanvasImages.map(ci => ci.y)) + 480 } : {}),
              }}
              onClick={() => { showColorPresets && setShowColorPresets(false); showShortcuts && setShowShortcuts(false); }}
            >
              <RichTextEditor
                key={`${selected.noteId}-${selected.subId}`}
                ref={editorRef}
                content={selectedContent || ''}
                placeholder="Start writing..."
                style={{ lineHeight: lineSpacing }}
                onChange={updateSelectedContent}
                onPasteImage={addCanvasImage}
              />
              {selectedCanvasImages.map(ci => (
                <CanvasImage
                  key={ci.id}
                  img={ci}
                  strokesVersion={strokesVersion}
                  onCommit={patch => patchSelectedCanvas(arr => arr.map(c => c.id === ci.id ? { ...c, ...patch } : c))}
                  onDelete={() => patchSelectedCanvas(arr => arr.filter(c => c.id !== ci.id))}
                  onOpen={info => setCanvasLightbox(info)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="notes-editor-empty">
            <h3>Select a note</h3>
            <p>Select a note from the sidebar or create a new one</p>
          </div>
        )}
      </div>

      {/* Canvas image lightbox: double-click to open, draw with the mouse,
          click anywhere outside the image (or Esc) to close */}
      {canvasLightbox && (
        <CanvasLightbox
          imgId={canvasLightbox.imgId}
          src={canvasLightbox.src}
          onClose={() => setCanvasLightbox(null)}
        />
      )}
    </div>
  );
}

export default Notes;
