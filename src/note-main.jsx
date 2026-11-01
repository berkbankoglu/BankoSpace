import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import NoteQuickEdit from './components/widgets/NoteQuickEdit.jsx'
import './App.css'

// The window a note opens in from the dashboard (utils/noteWindow.js). It only
// reads and writes the notes in this device's storage — the main window,
// which shares that storage, does the syncing.

const params = new URLSearchParams(window.location.search)
let noteId = null
let subId = null
try { noteId = JSON.parse(params.get('id')) } catch { /* no note */ }
try { subId = params.has('sub') ? JSON.parse(params.get('sub')) : null } catch { /* main page */ }

// Same look as the main window.
const theme = localStorage.getItem('theme') || 'dark'
const colorTheme = localStorage.getItem('colorTheme') || 'noir'
document.body.className = `${theme} color-${colorTheme}`

const win = getCurrentWindow()
// Picked again from the dashboard while open: go to that page.
getCurrentWebviewWindow().listen('note-select-sub', (e) => {
  window.dispatchEvent(new CustomEvent('nq-select-sub', { detail: e.payload }))
})
const close = () => { win.close().catch(() => win.destroy()) }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NoteQuickEdit
      asWindow
      noteId={noteId}
      initialSubId={subId}
      onDragStart={() => { win.startDragging().catch(() => {}) }}
      onClose={close}
      onOpenInNotes={() => { emit('note-open-in-notes', noteId).finally(close) }}
    />
  </React.StrictMode>,
)
