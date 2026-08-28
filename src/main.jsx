import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initDiag } from './utils/diag'
import { isTauri } from './platform'

// Freeze/crash diagnostics → %USERPROFILE%\bankospace-diag.log (desktop only
// — there's no on-disk log file to write to from a browser tab)
if (isTauri) initDiag()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
