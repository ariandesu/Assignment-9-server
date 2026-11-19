// Express only treats middleware with exactly four parameters as an error
// handler; with three it is skipped and errors fall through to the built-in
// HTML error page instead of the { message } JSON contract.
export function errorHandler(err, req, res, _next) {
  // Log the stack, not the raw error object: driver errors can embed the
  // connection URI, and credentials must never reach the log stream.
  console.error(`${req.method} ${req.originalUrl} failed:`, err.stack || err.message);

  const status = Number.isInteger(err.status) ? err.status : 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({ message });
}
