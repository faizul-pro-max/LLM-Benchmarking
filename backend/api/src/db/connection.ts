import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const dbPath = process.env.SQLITE_PATH ?? './data/bench.db'
const dir = path.dirname(dbPath)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export default db
