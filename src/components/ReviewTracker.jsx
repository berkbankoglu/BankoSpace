import { useState, useMemo, useRef, useEffect } from 'react';
import { pushKeyToSupabase } from '../supabase';
import { confirmAsync } from '../platform';
import './ReviewTracker.css';

const STORAGE_KEY = 'reviews_v1';

// One library for everything consumed rather than a separate list per medium —
// the type is just a field, so films, books and a half-hour tutorial all sort,
// filter and rate the same way.
export const TYPES = [
  { id: 'movie',   label: 'Movie',   glyph: '🎬', hue: '#6366f1' },
  { id: 'series',  label: 'Series',  glyph: '📺', hue: '#a855f7' },
  { id: 'book',    label: 'Book',    glyph: '📖', hue: '#d29922' },
  { id: 'video',   label: 'Video',   glyph: '▶',  hue: '#ef4444' },
  { id: 'game',    label: 'Game',    glyph: '🎮', hue: '#22c55e' },
  { id: 'podcast', label: 'Podcast', glyph: '🎧', hue: '#06b6d4' },
  { id: 'article', label: 'Article', glyph: '📄', hue: '#8b949e' },
  { id: 'other',   label: 'Other',   glyph: '✦',  hue: '#f59e0b' },
];

const STATUSES = [
  { id: 'backlog',  label: 'Backlog',  short: 'Backlog' },
  { id: 'progress', label: 'Ongoing',  short: 'Ongoing' },
  { id: 'done',     label: 'Finished', short: 'Finished' },
  { id: 'dropped',  label: 'Dropped',  short: 'Dropped' },
];

const SORTS = [
  { id: 'recent',  label: 'Recently added' },
  { id: 'rating',  label: 'Highest rated' },
  { id: 'title',   label: 'Title A–Z' },
  { id: 'finished', label: 'Recently finished' },
];

const typeOf = (id) => TYPES.find(t => t.id === id) || TYPES[TYPES.length - 1];
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function persist(items) {
  const val = JSON.stringify(items);
  localStorage.setItem(STORAGE_KEY, val);
  pushKeyToSupabase(STORAGE_KEY, val);
}

// Ratings are stored in half-star steps (0–10) so a 3½ is a plain integer.
function Stars({ value = 0, onChange, size = 'md', readOnly = false }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value;
  return (
    <span
      className={`rv-stars rv-stars--${size}${readOnly ? '' : ' rv-stars--interactive'}`}
      onMouseLeave={() => setHover(null)}
      role={readOnly ? undefined : 'slider'}
      aria-valuenow={value / 2}
      aria-valuemin={0}
      aria-valuemax={5}
    >
      {[0, 1, 2, 3, 4].map(i => {
        const full = shown >= (i + 1) * 2;
        const half = !full && shown >= i * 2 + 1;
        return (
          <span key={i} className="rv-star-slot">
            <span className={`rv-star${full ? ' full' : half ? ' half' : ''}`}>★</span>
            {!readOnly && (
              <>
                <button
                  className="rv-star-hit rv-star-hit--left"
                  aria-label={`${i + 0.5} stars`}
                  onMouseEnter={() => setHover(i * 2 + 1)}
                  onClick={() => onChange(value === i * 2 + 1 ? 0 : i * 2 + 1)}
                />
                <button
                  className="rv-star-hit rv-star-hit--right"
                  aria-label={`${i + 1} stars`}
                  onMouseEnter={() => setHover((i + 1) * 2)}
                  onClick={() => onChange(value === (i + 1) * 2 ? 0 : (i + 1) * 2)}
                />
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}

// Cover art is optional; without a URL an item still needs to be recognisable
// at a glance, so it falls back to a tint derived from its own title.
function Cover({ item, size = 'grid' }) {
  const t = typeOf(item.type);
  // Seeded from the entry's id, not its title — deriving it from the title made
  // the gradient swing on every keystroke while naming something.
  const angle = Number(item.id) % 360;
  return (
    <div
      className={`rv-cover rv-cover--${size}`}
      style={item.cover
        ? { backgroundImage: `url(${item.cover})` }
        : { background: `linear-gradient(${angle}deg, ${t.hue}44, ${t.hue}14 70%, transparent)` }}
    >
      {!item.cover && <span className="rv-cover-glyph">{t.glyph}</span>}
      {item.status === 'progress' && <span className="rv-cover-flag">Ongoing</span>}
    </div>
  );
}

export default function ReviewTracker() {
  const [items, setItems] = useState(load);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState(() => localStorage.getItem('rv_sort') || 'recent');
  const [view, setView] = useState(() => localStorage.getItem('rv_view') || 'grid');
  const [openId, setOpenId] = useState(null);
  const [draftTag, setDraftTag] = useState('');
  const searchRef = useRef(null);

  useEffect(() => { localStorage.setItem('rv_view', view); }, [view]);
  useEffect(() => { localStorage.setItem('rv_sort', sort); }, [sort]);

  const commit = (next) => { setItems(next); persist(next); };
  const patch = (id, changes) => commit(items.map(i => (i.id === id ? { ...i, ...changes } : i)));

  const open = items.find(i => i.id === openId) || null;

  const addItem = () => {
    const item = {
      id: Date.now(),
      title: '',
      type: 'movie',
      creator: '',
      year: '',
      status: 'backlog',
      rating: 0,
      tags: [],
      review: '',
      link: '',
      cover: '',
      addedAt: todayISO(),
      finishedAt: '',
    };
    commit([item, ...items]);
    setOpenId(item.id);
  };

  const removeItem = async (id) => {
    const item = items.find(i => i.id === id);
    const ok = await confirmAsync(`Delete "${item?.title || 'this entry'}"?`, {
      title: 'Delete entry', kind: 'warning', okLabel: 'Delete', cancelLabel: 'Cancel',
    });
    if (!ok) return;
    commit(items.filter(i => i.id !== id));
    setOpenId(null);
  };

  // Marking something finished fills in the date it happened, which is what the
  // "finished" sort and the year stat both read.
  const setStatus = (id, status) => {
    const item = items.find(i => i.id === id);
    patch(id, {
      status,
      finishedAt: status === 'done' ? (item.finishedAt || todayISO()) : (status === 'dropped' ? item.finishedAt : ''),
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter(i => {
      if (typeFilter !== 'all' && i.type !== typeFilter) return false;
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!q) return true;
      return [i.title, i.creator, i.review, ...(i.tags || [])]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
    list = [...list];
    if (sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.title).localeCompare(b.title));
    else if (sort === 'title') list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    else if (sort === 'finished') list.sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')));
    else list.sort((a, b) => b.id - a.id);
    return list;
  }, [items, query, typeFilter, statusFilter, sort]);

  const stats = useMemo(() => {
    const rated = items.filter(i => i.rating > 0);
    const year = String(new Date().getFullYear());
    return {
      total: items.length,
      finished: items.filter(i => i.status === 'done').length,
      ongoing: items.filter(i => i.status === 'progress').length,
      backlog: items.filter(i => i.status === 'backlog').length,
      thisYear: items.filter(i => i.status === 'done' && String(i.finishedAt).startsWith(year)).length,
      avg: rated.length ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length / 2) : 0,
    };
  }, [items]);

  const counts = useMemo(() => {
    const map = { all: items.length };
    TYPES.forEach(t => { map[t.id] = items.filter(i => i.type === t.id).length; });
    return map;
  }, [items]);

  const addTag = (item) => {
    const tag = draftTag.trim();
    if (!tag) return;
    if (!(item.tags || []).includes(tag)) patch(item.id, { tags: [...(item.tags || []), tag] });
    setDraftTag('');
  };

  return (
    <div className="rv-root">
      <header className="rv-header">
        <div className="rv-header-main">
          <h1 className="rv-title">Review</h1>
          <p className="rv-subtitle">Everything you read, watched, played or listened to — rated in one place.</p>
        </div>
        <div className="rv-stats">
          <div className="rv-stat"><span className="rv-stat-num">{stats.total}</span><span className="rv-stat-label">Logged</span></div>
          <div className="rv-stat"><span className="rv-stat-num">{stats.finished}</span><span className="rv-stat-label">Finished</span></div>
          <div className="rv-stat"><span className="rv-stat-num">{stats.thisYear}</span><span className="rv-stat-label">This year</span></div>
          <div className="rv-stat">
            <span className="rv-stat-num">{stats.avg ? stats.avg.toFixed(1) : '—'}</span>
            <span className="rv-stat-label">Avg rating</span>
          </div>
        </div>
      </header>

      <div className="rv-toolbar">
        <div className="rv-search">
          <span className="rv-search-icon">⌕</span>
          <input
            ref={searchRef}
            className="rv-search-input"
            placeholder="Search title, creator, tag or review…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && <button className="rv-search-clear" onClick={() => setQuery('')}>×</button>}
        </div>

        <div className="rv-chips">
          <button className={`rv-chip${typeFilter === 'all' ? ' active' : ''}`} onClick={() => setTypeFilter('all')}>
            All <span className="rv-chip-count">{counts.all}</span>
          </button>
          {TYPES.filter(t => counts[t.id] > 0 || typeFilter === t.id).map(t => (
            <button
              key={t.id}
              className={`rv-chip${typeFilter === t.id ? ' active' : ''}`}
              style={typeFilter === t.id ? { borderColor: t.hue, color: t.hue } : undefined}
              onClick={() => setTypeFilter(t.id)}
            >
              <span className="rv-chip-glyph">{t.glyph}</span>{t.label}
              <span className="rv-chip-count">{counts[t.id]}</span>
            </button>
          ))}
        </div>

        <div className="rv-toolbar-right">
          <select className="rv-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select className="rv-select" value={sort} onChange={e => setSort(e.target.value)}>
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="rv-viewtoggle">
            <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Grid">▦</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} title="List">☰</button>
          </div>
          <button className="rv-add" onClick={addItem}>+ Add</button>
        </div>
      </div>

      <div className="rv-body">
        {visible.length === 0 ? (
          <div className="rv-empty">
            <div className="rv-empty-glyph">★</div>
            <div className="rv-empty-title">{items.length === 0 ? 'Nothing logged yet' : 'Nothing matches those filters'}</div>
            <div className="rv-empty-hint">
              {items.length === 0
                ? 'Add the last film, book or video you finished and give it a rating.'
                : 'Try a different type, status or search term.'}
            </div>
            {items.length === 0 && <button className="rv-add rv-add--big" onClick={addItem}>+ Add your first entry</button>}
          </div>
        ) : view === 'grid' ? (
          <div className="rv-grid">
            {visible.map(item => {
              const t = typeOf(item.type);
              return (
                <button key={item.id} className={`rv-card${openId === item.id ? ' selected' : ''}`} onClick={() => setOpenId(item.id)}>
                  <Cover item={item} />
                  <div className="rv-card-body">
                    <div className="rv-card-title">{item.title || 'Untitled'}</div>
                    <div className="rv-card-meta">
                      <span className="rv-type-dot" style={{ background: t.hue }} />
                      {t.label}{item.creator ? ` · ${item.creator}` : ''}{item.year ? ` · ${item.year}` : ''}
                    </div>
                    <div className="rv-card-foot">
                      <Stars value={item.rating} readOnly size="sm" />
                      <span className={`rv-status rv-status--${item.status}`}>{STATUSES.find(s => s.id === item.status)?.short}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rv-list">
            <div className="rv-list-head">
              <span />
              <span>Title</span>
              <span>Type</span>
              <span>Status</span>
              <span>Rating</span>
              <span>Finished</span>
            </div>
            {visible.map(item => {
              const t = typeOf(item.type);
              return (
                <button key={item.id} className={`rv-row${openId === item.id ? ' selected' : ''}`} onClick={() => setOpenId(item.id)}>
                  <Cover item={item} size="row" />
                  <span className="rv-row-title">
                    {item.title || 'Untitled'}
                    {item.creator && <span className="rv-row-creator">{item.creator}</span>}
                  </span>
                  <span className="rv-row-type"><span className="rv-type-dot" style={{ background: t.hue }} />{t.label}</span>
                  <span><span className={`rv-status rv-status--${item.status}`}>{STATUSES.find(s => s.id === item.status)?.short}</span></span>
                  <span><Stars value={item.rating} readOnly size="sm" /></span>
                  <span className="rv-row-date">{fmtDate(item.finishedAt) || '—'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="rv-scrim" onClick={() => setOpenId(null)} />
          <aside className="rv-detail">
            <div className="rv-detail-head">
              <Cover item={open} size="detail" />
              <div className="rv-detail-headtext">
                <input
                  className="rv-detail-title"
                  placeholder="Title"
                  value={open.title}
                  autoFocus={!open.title}
                  onChange={e => patch(open.id, { title: e.target.value })}
                />
                <div className="rv-detail-sub">
                  <input className="rv-mini-input" placeholder="Creator / author" value={open.creator} onChange={e => patch(open.id, { creator: e.target.value })} />
                  <input className="rv-mini-input rv-mini-input--year" placeholder="Year" value={open.year} onChange={e => patch(open.id, { year: e.target.value })} />
                </div>
              </div>
              <button className="rv-detail-close" onClick={() => setOpenId(null)} title="Close">×</button>
            </div>

            <div className="rv-field">
              <label className="rv-label">Rating</label>
              <div className="rv-rating-row">
                <Stars value={open.rating} onChange={v => patch(open.id, { rating: v })} size="lg" />
                <span className="rv-rating-num">{open.rating ? (open.rating / 2).toFixed(1) : '—'}</span>
              </div>
            </div>

            <div className="rv-field">
              <label className="rv-label">Type</label>
              <div className="rv-type-grid">
                {TYPES.map(t => (
                  <button
                    key={t.id}
                    className={`rv-type-btn${open.type === t.id ? ' active' : ''}`}
                    style={open.type === t.id ? { borderColor: t.hue, color: t.hue } : undefined}
                    onClick={() => patch(open.id, { type: t.id })}
                  >
                    <span>{t.glyph}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rv-field">
              <label className="rv-label">Status</label>
              <div className="rv-status-row">
                {STATUSES.map(s => (
                  <button
                    key={s.id}
                    className={`rv-status-btn${open.status === s.id ? ' active' : ''}`}
                    onClick={() => setStatus(open.id, s.id)}
                  >{s.label}</button>
                ))}
              </div>
            </div>

            {(open.status === 'done' || open.status === 'dropped') && (
              <div className="rv-field">
                <label className="rv-label">Finished on</label>
                <input className="rv-input" type="date" value={open.finishedAt || ''} onChange={e => patch(open.id, { finishedAt: e.target.value })} />
              </div>
            )}

            <div className="rv-field">
              <label className="rv-label">Tags</label>
              <div className="rv-tags">
                {(open.tags || []).map(tag => (
                  <span key={tag} className="rv-tag">
                    {tag}
                    <button onClick={() => patch(open.id, { tags: open.tags.filter(x => x !== tag) })}>×</button>
                  </span>
                ))}
                <input
                  className="rv-tag-input"
                  placeholder="Add tag…"
                  value={draftTag}
                  onChange={e => setDraftTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTag(open); }}
                  onBlur={() => addTag(open)}
                />
              </div>
            </div>

            <div className="rv-field rv-field--grow">
              <label className="rv-label">Review</label>
              <textarea
                className="rv-textarea"
                placeholder="What stayed with you? What would you tell someone before they start it?"
                value={open.review}
                onChange={e => patch(open.id, { review: e.target.value })}
              />
            </div>

            <div className="rv-field">
              <label className="rv-label">Cover image URL</label>
              <input className="rv-input" placeholder="https://…" value={open.cover} onChange={e => patch(open.id, { cover: e.target.value })} />
            </div>

            <div className="rv-field">
              <label className="rv-label">Link</label>
              <input className="rv-input" placeholder="https://…" value={open.link} onChange={e => patch(open.id, { link: e.target.value })} />
            </div>

            <div className="rv-detail-foot">
              <span className="rv-detail-added">Added {fmtDate(open.addedAt)}</span>
              <button className="rv-delete" onClick={() => removeItem(open.id)}>Delete</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
