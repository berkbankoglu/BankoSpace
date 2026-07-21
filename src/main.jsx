import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initDiag } from './utils/diag'

// Freeze/crash diagnostics → %USERPROFILE%\bankospace-diag.log
initDiag()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
