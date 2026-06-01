import morgan from 'morgan'

export const requestLogger = morgan((tokens, req, res) =>
  JSON.stringify({
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: tokens.status(req, res),
    ms: tokens['response-time'](req, res),
    ts: Date.now(),
  })
)
