// Full-screen image detail. Actions: favorite, find-similar, save (download),
// delete. (Publishing was removed; it'll return in a later version.)

import React from 'react'

export default function DetailView({ item, onClose, onToggleFavorite, onDelete, onFindSimilar }) {
  if (!item) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{item.width} x {item.height}</span>
          <button className="icon-btn" onClick={onClose}>x</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
          <div className="preview-box" style={{ aspectRatio: 'auto', maxHeight: '70vh' }}>
            <img src={item.image} alt="" style={{ objectFit: 'contain' }} />
          </div>

          <div className="stack">
            <div>
              <label className="field-label">Positive</label>
              <div className="raw-panel">{item.positive || '-'}</div>
            </div>
            <div>
              <label className="field-label">Negative</label>
              <div className="raw-panel">{item.negative || '-'}</div>
            </div>
            <div className="muted">
              <div>Checkpoint: {item.checkpoint || '-'}</div>
              <div>Date: {item.createdAt}</div>
            </div>
            <div className="detail-actions">
              <button className={`btn ${item.favorite ? 'btn-primary' : ''}`} onClick={() => onToggleFavorite(item.id)}>
                {item.favorite ? '* Favorite' : 'o Favorite'}
              </button>
              {onFindSimilar && (
                <button className="btn btn-similar" onClick={() => onFindSimilar(item.id)} title="Find images with a similar pose / outfit / scene">
                  Q Similar
                </button>
              )}
              <a className="btn" href={item.image} download={`operation-v-${item.id}.png`} title="Save this image to your computer">
                v Save
              </a>
              <button className="btn btn-danger" onClick={() => onDelete(item.id)}>Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
