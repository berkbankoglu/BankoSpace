import { putImage, getImage, newImageId, putStrokes, getStrokes } from './imageStore';

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

export async function externalizeNotes(notesArr) {
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

export async function inlineNotesForExport(notesArr) {
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

