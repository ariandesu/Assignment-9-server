const allowList = (process.env.CLIENT_URLS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// An empty allow-list denies every browser origin. That presents as a bare 404
// on preflight, which reads like a routing bug rather than a config error, so
// say so once at startup instead of failing silently.
if (allowList.length === 0) {
  console.warn('CLIENT_URLS is empty — all cross-origin browser requests will be refused');
}

export const corsOptions = {
  origin: (origin, callback) => callback(null, !origin || allowList.includes(origin)),
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
};
