import db from '../connection'
import type { RunPhase, RunConfig } from '../../types/run'

export function insertRun(id: string, name: string, config: RunConfig) {
  db.prepare(`
    INSERT INTO runs (id, name, config, phase, started_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(id, name, JSON.stringify(config), Date.now())
}

export function updateRunPhase(id: string, phase: RunPhase, endedAt?: number) {
  if (endedAt) {
    db.prepare(`UPDATE runs SET phase = ?, ended_at = ? WHERE id = ?`).run(phase, endedAt, id)
  } else {
    db.prepare(`UPDATE runs SET phase = ? WHERE id = ?`).run(phase, id)
  }
}

export function getRunById(id: string) {
  return db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id)
}

export function getAllRuns() {
  return db.prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all()
}
