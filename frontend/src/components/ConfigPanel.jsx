// Right-hand panel on the Generate view: checkpoint, quantity, resolution and LoRA
// pickers, plus Backend/ComfyUI/LLM status and the generation progress bar.

import React from 'react'

export default function ConfigPanel({
  onOpenSettings,
  checkpoints, checkpoint, setCheckpoint,
  workflows, workflow, setWorkflow,
  loraSupported, lora, onPickLora, onClearLora,
  resolution, onOpenResolution,
  quantity, setQuantity,
  onRefresh, refreshing,
  onGoDesigns,
  health,
  generating, progressLabel, genPercent
}) {
  return (
    <div className="panel">
      <div className="row-between" style={{ marginBottom: 4 }}>
        <span className="section-title">Configuration</span>
        <button className="icon-btn" title="Settings" onClick={onOpenSettings}>*</button>
      </div>

      <div className="config-row">
        <label className="field-label">Checkpoint</label>
        {checkpoints.length === 0 ? (
          <div className="muted">No checkpoints found. Click Refresh.</div>
        ) : (
          <select className="select" value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
            {checkpoints.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className="config-row">
        <label className="field-label">Workflow</label>
        <select className="select" value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
          {workflows.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
        </select>
      </div>

      {loraSupported && (
        <div className="config-row">
          <label className="field-label">LoRA</label>
          {lora ? (
            <div className="row-between">
              <span className="muted" style={{ wordBreak: 'break-word' }}>
                {lora.name} - {Number(lora.strength).toFixed(2)}
              </span>
              <button className="icon-btn" onClick={onClearLora}>x</button>
            </div>
          ) : (
            <button className="btn btn-block" onClick={onPickLora}>Pick LoRA</button>
          )}
        </div>
      )}

      <div className="config-row">
        <label className="field-label">Resolution</label>
        <button className="btn btn-block" onClick={onOpenResolution}>
          {resolution.w} x {resolution.h}
        </button>
      </div>

      <div className="config-row">
        <label className="field-label">Quantity</label>
        <input
          className="input"
          type="text"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            setQuantity(v === '' ? '' : Math.min(100, Number(v)))
          }}
          onBlur={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
        />
      </div>

      <div className="config-row">
        <button className="btn btn-block" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <button className="btn btn-block" style={{ marginTop: 8 }} onClick={onGoDesigns}>Models -></button>
      </div>

      <div className="config-row">
        <label className="field-label">Status</label>

        <div className="gen-status-slot">
          {generating && (
            <div className="gen-status">
              <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                <span className="dot" style={{ background: 'var(--brand)', boxShadow: '0 0 9px var(--brand)' }} />
                <span style={{ color: 'var(--brand-on)', fontSize: 13 }}>{progressLabel || 'Generating...'}</span>
              </div>
              {genPercent != null ? (
                <div className="progress"><div className="progress-bar-fill" style={{ width: `${genPercent}%` }} /></div>
              ) : (
                <div className="progress"><div className="progress-bar" /></div>
              )}
            </div>
          )}
        </div>

        <div className="status-line"><span className={`dot ${health.backend ? 'on' : 'off'}`} /> Backend: {health.backend ? 'connected' : 'disconnected'}</div>
        <div className="status-line"><span className={`dot ${health.comfyui ? 'on' : 'off'}`} /> ComfyUI: {health.comfyui ? 'connected' : 'not running'}</div>
        <div className="status-line"><span className={`dot ${health.llm ? 'on' : 'off'}`} /> Local LLM: {health.llm ? 'connected' : 'not running'}</div>
      </div>

      <div className="config-version">v{health.version || '-'}</div>
    </div>
  )
}
