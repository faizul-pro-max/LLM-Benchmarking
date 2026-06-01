import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express'

export const errorHandler: ErrorRequestHandler = (err, _req: Request, res: Response, _next: NextFunction) => {
  console.log({ msg: 'unhandled error', err: String(err), ts: Date.now() })
  res.status(500).json({ error: 'Internal server error' })
}
