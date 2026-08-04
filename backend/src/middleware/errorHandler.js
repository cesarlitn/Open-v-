// Central error handler. Consistent JSON shape: { error: "..." }.

function errorHandler(err, req, res, next) {
  console.error('[error]', err && err.stack ? err.stack : err)
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
}

module.exports = errorHandler
