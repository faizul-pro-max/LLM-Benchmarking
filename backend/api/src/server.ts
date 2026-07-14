import 'dotenv/config'
import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import { runMigrations } from './db/schema'
import { loadPrompts } from './utils/sheetsLoader'
import { requestLogger } from './middleware/requestLogger'
import { errorHandler } from './middleware/errorHandler'
import healthRouter from './routes/health'
import runRouter from './routes/run'
import resultsRouter from './routes/results'
import experimentsRouter from './routes/experiments'
import promptsRouter from './routes/prompts'
import datasetsRouter from './routes/datasets'
import chatRouter from './routes/chat'
import controllerRouter from './routes/controller'
import debugRouter from './routes/debug'
import { startMetricsLoop, setChatSession } from './utils/metricsCollector'
import type { ServerToClientEvents, ClientToServerEvents } from './types/socket'

const PORT         = parseInt(process.env.PORT ?? '3001', 10)
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:7755'

const app    = express()
const server = http.createServer(app)
const io     = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
})

// Export io for use in routes
let _io: typeof io
export function getIo() { return _io }

app.use(cors({ origin: FRONTEND_URL }))
app.use(express.json())
app.use(requestLogger)

app.use('/health', healthRouter)
app.use('/run', runRouter)
app.use('/results', resultsRouter)
app.use('/experiments', experimentsRouter)
app.use('/prompts', promptsRouter)
app.use('/datasets', datasetsRouter)
app.use('/chat', chatRouter)
app.use('/controller', controllerRouter)
app.use('/debug', debugRouter)
app.use(errorHandler)

io.on('connection', (socket) => {
  console.log({ msg: 'client connected', id: socket.id, ts: Date.now() })

  // Declare/clear the active chat session so live metrics get tagged + persisted
  // per conversation. null means the client left chat.
  socket.on('chat:session', ({ sessionId }) => {
    setChatSession(sessionId)
    console.log({ msg: 'chat session set', id: socket.id, sessionId, ts: Date.now() })
  })

  socket.on('disconnect', () => {
    console.log({ msg: 'client disconnected', id: socket.id, ts: Date.now() })
  })
})

async function start() {
  runMigrations()
  await loadPrompts()
  _io = io

  // Always-on live metrics — flows as soon as the server boots (no run needed).
  startMetricsLoop(io)

  server.listen(PORT, () => {
    console.log({ msg: 'server started', port: PORT, frontend: FRONTEND_URL, ts: Date.now() })
  })
}

start().catch((err) => {
  console.error({ msg: 'startup failed', err: String(err) })
  process.exit(1)
})
