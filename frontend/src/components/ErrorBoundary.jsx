// React error boundary: catches render-time errors and shows a safe fallback
// instead of a blank screen.

import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[app error]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, color: '#eef0fb', fontFamily: 'Inter, system-ui, sans-serif',
          background: '#05060e'
        }}>
          <div style={{ maxWidth: 520, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Something went wrong</div>
            <div style={{ color: '#bcc2e2', fontSize: 14, marginBottom: 18 }}>
              The interface hit an error. Reload to continue. If it persists, check the
              browser console and make sure dependencies are installed
              (run <code>npm run install:all</code>).
            </div>
            <pre style={{
              textAlign: 'left', fontSize: 12, color: '#ff9b9b', background: '#11152a',
              border: '1px solid #232c4d', borderRadius: 8, padding: 12, overflow: 'auto', maxHeight: 200
            }}>{String(this.state.error && this.state.error.stack || this.state.error)}</pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16, padding: '10px 18px', borderRadius: 9, cursor: 'pointer',
                color: '#070a16', border: 'none', fontWeight: 600,
                background: 'linear-gradient(120deg,#5fd0ff,#b3a8ff,#ff6ad5)'
              }}
            >Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
