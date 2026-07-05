import db from '../connection'
import type { RunPhase, RunConfig } from '../../types/run'

export function insertRun(id: string, name: string, config: RunConfig, description?: string) {
  db.prepare(`
    INSERT INTO runs (id, name, config, description, phase, started_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(id, name, JSON.stringify(config), description ?? null, Date.now())
}

// Overwrite the stored config JSON — used to enrich a run's server snapshot with
// live details collected asynchronously after the run has already been inserted.
export function updateRunConfig(id: string, config: RunConfig) {
  db.prepare(`UPDATE runs SET config = ? WHERE id = ?`).run(JSON.stringify(config), id)
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
