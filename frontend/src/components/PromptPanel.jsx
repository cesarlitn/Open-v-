// Positive/negative prompt inputs and the Generate / Stop buttons.

import React from 'react'

export default function PromptPanel({
  positive, negative, setPositive, setNegative,
  preview, onPreviewClick,
  generating,
  onGenerate, onStop,
  onClearPositive, onClearNegative
}) {
  return (
    <div className="panel prompt-panel">
      <div className="preview-box preview-square">
        {preview ? (
          <img src={preview} alt="latest generation" onClick={onPreviewClick} />
        ) : (
          <div className="preview-placeholder">No image yet</div>
        )}
      </div>

      <div className="stack">
        <div className="field-pos">
          <div className="field-head">
            <label className="field-label">Positive Prompt</label>
            <button className="mini-clear" onClick={onClearPositive} disabled={!positive}>clear</button>
          </div>
          <textarea
            className="textarea textarea-positive"
            value={positive}
            onChange={(e) => setPositive(e.target.value)}
          />
        </div>

        <div className="field-neg">
          <div className="field-head">
            <label className="field-label">Negative Prompt</label>
            <button className="mini-clear" onClick={onClearNegative} disabled={!negative}>clear</button>
          </div>
          <textarea
            className="textarea textarea-negative"
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
          />
        </div>

        <div className="row gen-row">
          {generating ? (
            <button className="btn btn-danger btn-block gen-btn" onClick={onStop}> Stop</button>
          ) : (
            <button className="btn btn-primary btn-block gen-btn" onClick={onGenerate}>Generate</button>
          )}
          {/* Trash clears the POSITIVE prompt only (per spec). */}
          <button className="icon-btn" title="Clear positive prompt" onClick={onClearPositive} disabled={!positive}>del</button>
        </div>
      </div>
    </div>
  )
}
