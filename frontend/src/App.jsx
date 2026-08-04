// Root component. Switches between the three top-level views (landing,
// generate, designs/Models) and shares the image-fit preference across panels.

import React, { useState } from 'react'
import Landing from './pages/Landing'
import Home from './pages/Home'
import DesignsPage from './pages/DesignsPage'

const FIT_KEY = 'designFitContain'
const loadFit = () => { try { return localStorage.getItem(FIT_KEY) === '1' } catch { return false } }

export default function App() {
  const [view, setView] = useState('landing') // 'landing' | 'generate' | 'designs'
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState('')
  const [openSettings, setOpenSettings] = useState(false)
  const [fitContain, setFitContain] = useState(loadFit())

  const setFit = (v) => {
    setFitContain(v)
    try { localStorage.setItem(FIT_KEY, v ? '1' : '0') } catch { /* ignore */ }
  }

  const sendToGenerate = ({ positive: p, negative: n }) => {
    if (p !== undefined) setPositive(p)
    if (n !== undefined) setNegative(n)
    setView('generate')
  }

  const navigate = (dest) => {
    if (dest === 'settings') { setOpenSettings(true); setView('generate') }
    else setView(dest)
  }

  return (
    <>
      {view === 'landing' && <Landing onNavigate={navigate} />}

      <div style={{ display: view === 'generate' ? 'block' : 'none' }}>
        <Home
          active={view === 'generate'}
          positive={positive} negative={negative}
          setPositive={setPositive} setNegative={setNegative}
          onGoDesigns={() => setView('designs')}
          onHome={() => setView('landing')}
          autoOpenSettings={openSettings}
          onSettingsHandled={() => setOpenSettings(false)}
          fitContain={fitContain} setFitContain={setFit}
        />
      </div>

      <div style={{ display: view === 'designs' ? 'block' : 'none' }}>
        <DesignsPage
          active={view === 'designs'}
          onBack={() => setView('generate')}
          onSendToGenerate={sendToGenerate}
          fitContain={fitContain}
        />
      </div>
    </>
  )
}
