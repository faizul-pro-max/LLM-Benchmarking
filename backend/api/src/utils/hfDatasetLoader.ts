import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import type { Prompt } from './sheetsLoader'
import type { Workload } from '../types/run'

/** A multi-turn Q&A conversation sourced from HuggingFace. `turns` holds only
 *  the ordered human/user turn strings — assistant replies are generated live
 *  by vLLM during a run, not sourced from the dataset (see loadGenerator.ts
 *  runQaConversations). Always has >= 5 turns (filtered at load time). */
export interface Conversation {
  id: string
  turns: string[]
}

type HfWorkload = 'short' | 'long'

interface DatasetProfile {
  repoId: string
  config: string
  split: string
  /** Column holding the prompt text (short/long) or the turn list (qa). */
  field: string
  /** Optional second field concatenated after `field` (e.g. Alpaca's `input`). */
  secondaryField?: string
  /** Optional text prepended before `field`'s content (e.g. a summarize instruction). */
  promptPrefix?: string
  /** Max rows parsed from the first downloaded parquet file. */
  maxRows: number
}

function envOr(name: string, fallback: string): string {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : fallback
}

function defaultProfiles(): Record<'short' | 'long' | 'qa', DatasetProfile> {
  return {
    short: {
      repoId: envOr('HF_DATASET_SHORT_REPO_ID', 'tatsu-lab/alpaca'),
      config: envOr('HF_DATASET_SHORT_CONFIG', 'default'),
      split: envOr('HF_DATASET_SHORT_SPLIT', 'train'),
      field: envOr('HF_DATASET_SHORT_FIELD', 'instruction'),
      secondaryField: 'input',
      maxRows: 2000,
    },
    long: {
      repoId: envOr('HF_DATASET_LONG_REPO_ID', 'abisee/cnn_dailymail'),
      config: envOr('HF_DATASET_LONG_CONFIG', '3.0.0'),
      split: envOr('HF_DATASET_LONG_SPLIT', 'train'),
      field: envOr('HF_DATASET_LONG_FIELD', 'article'),
      promptPrefix: 'Summarize the following document:\n\n',
      maxRows: 300,
    },
    qa: {
      // Canonical namespaced repo id — the bare `daily_dialog` id now 307s here.
      repoId: envOr('HF_DATASET_QA_REPO_ID', 'li2017dailydialog/daily_dialog'),
      config: envOr('HF_DATASET_QA_CONFIG', 'default'),
      split: envOr('HF_DATASET_QA_SPLIT', 'train'),
      field: envOr('HF_DATASET_QA_FIELD', 'dialog'),
      maxRows: 2000,
    },
  }
}

// ---- HF Hub resolution + download -----------------------------------------

/** Resolves parquet file URLs for a dataset/config/split by listing HF's
 *  auto-generated `refs/convert/parquet` ref (every public dataset gets one,
 *  laid out as `{config}/{split}/*.parquet`), then building direct resolve
 *  URLs. This hits the Hub's core git-backed file storage API rather than
 *  the separate "datasets-server" convenience microservice (its JSON
 *  `/api/datasets/{repo}/parquet/...` endpoint was observed to intermittently
 *  503/400 — this path is more robust since it depends on nothing but the
 *  Hub's primary storage, which also means it works with zero auth for any
 *  public dataset without needing that service to be healthy). */
async function resolveParquetFileUrls(repoId: string, config: string, split: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  const headers: Record<string, string> = {}
  if (process.env.HF_TOKEN) headers.Authorization = `Bearer ${process.env.HF_TOKEN}`

  const treeUrl = `https://huggingface.co/api/datasets/${repoId}/tree/refs%2Fconvert%2Fparquet/${config}/${split}`
  const res = await fetch(treeUrl, { headers, signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HF parquet file listing failed (${res.status}) for ${repoId}/${config}/${split}: ${body.slice(0, 300)}`)
  }
  const entries = (await res.json()) as unknown
  if (!Array.isArray(entries)) {
    throw new Error(`unexpected HF tree response shape for ${repoId}/${config}/${split}`)
  }
  const relativePaths = (entries as Array<{ type?: string; path?: string }>)
    .filter((e): e is { type: string; path: string } => e.type === 'file' && typeof e.path === 'string' && e.path.endsWith('.parquet'))
    .map((e) => e.path)
    .sort()
  if (relativePaths.length === 0) {
    throw new Error(`no parquet files found for ${repoId}/${config}/${split} — check repoId/config/split are correct`)
  }
  return relativePaths.map((p) => `https://huggingface.co/datasets/${repoId}/resolve/refs%2Fconvert%2Fparquet/${p}`)
}

function sanitizeRepoId(repoId: string): string {
  return repoId.replace(/\//g, '__')
}

const CACHE_ROOT = path.join(process.cwd(), 'data', 'hf-cache')

function cacheDirFor(repoId: string, config: string, split: string): string {
  return path.join(CACHE_ROOT, sanitizeRepoId(repoId), config, split)
}

interface CacheMeta {
  repoId: string
  config: string
  split: string
  fileCount: number
  downloadedAt: number
}

function readCacheMeta(dir: string): CacheMeta | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '_meta.json'), 'utf-8')) as CacheMeta
  } catch {
    return null
  }
}

/** Downloads (or reuses a cached copy of) the first parquet file for a
 *  dataset/config/split — one file is plenty of rows for load-testing
 *  purposes and keeps downloads bounded for large sharded datasets. Streams
 *  straight to disk under backend/api/data/hf-cache/ (already gitignored),
 *  which doubles as the "unpack into a temp folder, files queued" step —
 *  each parquet file is one queued unit of parse work. */
async function downloadDatasetFiles(
  repoId: string,
  config: string,
  split: string,
  opts: { force?: boolean } = {},
): Promise<string[]> {
  const dir = cacheDirFor(repoId, config, split)
  const meta = readCacheMeta(dir)

  if (!opts.force && meta) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.parquet')).sort()
    if (files.length > 0) return files.map((f) => path.join(dir, f))
  }

  const urls = await resolveParquetFileUrls(repoId, config, split)
  const toDownload = urls.slice(0, 1)
  fs.mkdirSync(dir, { recursive: true })

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch') as typeof import('node-fetch').default
  const localPaths: string[] = []
  for (let i = 0; i < toDownload.length; i++) {
    const fileUrl = toDownload[i]
    const dest = path.join(dir, `part-${String(i).padStart(4, '0')}.parquet`)
    const res = await fetch(fileUrl)
    if (!res.ok || !res.body) throw new Error(`failed to download ${fileUrl}: HTTP ${res.status}`)
    await pipeline(res.body as unknown as NodeJS.ReadableStream, fs.createWriteStream(dest))
    localPaths.push(dest)
  }

  const newMeta: CacheMeta = { repoId, config, split, fileCount: localPaths.length, downloadedAt: Date.now() }
  fs.writeFileSync(path.join(dir, '_meta.json'), JSON.stringify(newMeta, null, 2))
  return localPaths
}

// ---- Parquet parsing (hyparquet is ESM-only — dynamic import, cached) -----

// hyparquet/hyparquet-compressors are ESM-only ("type": "module", no
// "require" export condition). TypeScript compiles this file to CommonJS
// (see tsconfig's module:"commonjs", matching the rest of the backend), and
// under that target it downlevels `import()` expressions into a
// Promise-wrapped `require()` — which then fails at runtime with
// ERR_PACKAGE_PATH_NOT_EXPORTED because Node's CJS loader cannot load a pure
// ESM package no matter how the call got there. Routing the specifier through
// `new Function` hides the import() from TS's static rewriting, so Node
// performs a genuine ESM dynamic import at runtime instead.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>

interface HyparquetModule {
  asyncBufferFromFile: (path: string) => Promise<unknown>
  // Pre-bound to this install's `compressors` object — callers only pass file/rowEnd.
  parquetReadObjects: (opts: { file: unknown; rowEnd?: number }) => Promise<Record<string, unknown>[]>
}

let hyparquetPromise: Promise<HyparquetModule> | null = null

async function getHyparquet(): Promise<HyparquetModule> {
  if (!hyparquetPromise) {
    hyparquetPromise = (async () => {
      // hyparquet's published types resolve (under classic Node module
      // resolution) to its browser-condition index.d.ts, which doesn't
      // declare `asyncBufferFromFile` — the actual runtime export (via
      // package.json `exports`."default" condition) does have it. Route
      // through `unknown` to describe the real runtime shape ourselves.
      const [hyparquet, compressorsMod] = await Promise.all([
        dynamicImport('hyparquet') as Promise<{
          asyncBufferFromFile: (path: string) => Promise<unknown>
          parquetReadObjects: (opts: { file: unknown; compressors: unknown; rowEnd?: number }) => Promise<Record<string, unknown>[]>
        }>,
        dynamicImport('hyparquet-compressors') as Promise<{ compressors: unknown }>,
      ])
      return {
        asyncBufferFromFile: hyparquet.asyncBufferFromFile,
        parquetReadObjects: (opts) => hyparquet.parquetReadObjects({ ...opts, compressors: compressorsMod.compressors }),
      }
    })()
  }
  return hyparquetPromise
}

async function parseParquetFile(filePath: string, maxRows: number): Promise<Record<string, unknown>[]> {
  const { asyncBufferFromFile, parquetReadObjects } = await getHyparquet()
  const file = await asyncBufferFromFile(filePath)
  return parquetReadObjects({ file, rowEnd: maxRows })
}

// ---- Field extraction -------------------------------------------------------

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (v == null) return ''
  return String(v).trim()
}

function buildPromptText(row: Record<string, unknown>, profile: DatasetProfile): string | null {
  const primary = str(row[profile.field])
  if (!primary) return null
  const secondary = profile.secondaryField ? str(row[profile.secondaryField]) : ''
  const body = secondary ? `${primary}\n\n${secondary}` : primary
  return profile.promptPrefix ? `${profile.promptPrefix}${body}` : body
}

function extractTurns(row: Record<string, unknown>, profile: DatasetProfile): string[] | null {
  const raw = row[profile.field]
  if (!Array.isArray(raw)) return null
  const turns = raw.map((t) => str(t)).filter(Boolean)
  return turns.length >= 5 ? turns : null
}

// ---- Module-level cache (mirrors sheetsLoader.ts's cached-pool pattern) ----

const cachedPrompts: Partial<Record<HfWorkload, Prompt[]>> = {}
const cachedPromptsMeta: Partial<Record<HfWorkload, { repoId: string; config: string; split: string; count: number; downloadedAt: number }>> = {}
let cachedConversations: Conversation[] | null = null
let cachedConversationsMeta: { repoId: string; config: string; split: string; count: number; downloadedAt: number } | null = null

const profiles = defaultProfiles()

function resolveProfile(workload: 'short' | 'long' | 'qa', opts: { repoId?: string; config?: string; split?: string; field?: string }): DatasetProfile {
  const base = profiles[workload]
  return {
    ...base,
    repoId: opts.repoId ?? base.repoId,
    config: opts.config ?? base.config,
    split: opts.split ?? base.split,
    field: opts.field ?? base.field,
  }
}

// ---- Public API --------------------------------------------------------------

export async function loadHfDataset(
  workload: HfWorkload,
  opts: { repoId?: string; config?: string; split?: string; field?: string; force?: boolean } = {},
): Promise<{ prompts: Prompt[]; source: 'huggingface'; meta: { repoId: string; config: string; split: string; count: number; downloadedAt: number } }> {
  const profile = resolveProfile(workload, opts)
  const files = await downloadDatasetFiles(profile.repoId, profile.config, profile.split, { force: opts.force })
  const rows = await parseParquetFile(files[0], profile.maxRows)

  const prompts: Prompt[] = []
  for (let i = 0; i < rows.length; i++) {
    const text = buildPromptText(rows[i], profile)
    if (!text) continue
    prompts.push({ id: `hf-${workload}-${String(i + 1).padStart(5, '0')}`, text, category: 'random' })
  }
  if (prompts.length === 0) {
    throw new Error(`no usable rows extracted from ${profile.repoId} (workload=${workload}, field="${profile.field}") — check field mapping via HF_DATASET_${workload.toUpperCase()}_FIELD`)
  }

  const meta = { repoId: profile.repoId, config: profile.config, split: profile.split, count: prompts.length, downloadedAt: Date.now() }
  cachedPrompts[workload] = prompts
  cachedPromptsMeta[workload] = meta
  return { prompts, source: 'huggingface', meta }
}

export async function loadHfConversations(
  opts: { repoId?: string; config?: string; split?: string; field?: string; force?: boolean } = {},
): Promise<{ conversations: Conversation[]; source: 'huggingface'; meta: { repoId: string; config: string; split: string; count: number; downloadedAt: number } }> {
  const profile = resolveProfile('qa', opts)
  const files = await downloadDatasetFiles(profile.repoId, profile.config, profile.split, { force: opts.force })
  const rows = await parseParquetFile(files[0], profile.maxRows)

  const conversations: Conversation[] = []
  for (let i = 0; i < rows.length; i++) {
    const turns = extractTurns(rows[i], profile)
    if (!turns) continue
    conversations.push({ id: `hf-qa-${String(i + 1).padStart(5, '0')}`, turns })
  }
  if (conversations.length < 5) {
    throw new Error(`only ${conversations.length} conversations with >=5 turns found in ${profile.repoId} (need at least 5) — check field mapping via HF_DATASET_QA_FIELD or raise maxRows`)
  }

  const meta = { repoId: profile.repoId, config: profile.config, split: profile.split, count: conversations.length, downloadedAt: Date.now() }
  cachedConversations = conversations
  cachedConversationsMeta = meta
  return { conversations, source: 'huggingface', meta }
}

export function getCachedWorkloadPrompts(workload: HfWorkload): Prompt[] | null {
  return cachedPrompts[workload] ?? null
}

export function getCachedConversations(): Conversation[] | null {
  return cachedConversations
}

/** Cycles the loaded pool to reach `count` prompts, mirroring
 *  sheetsLoader.ts's selectPrompts(). Empty array if nothing loaded yet. */
export function selectHfPrompts(workload: HfWorkload, count: number): Prompt[] {
  const pool = cachedPrompts[workload]
  if (!pool || pool.length === 0) return []
  const out: Prompt[] = []
  for (let i = 0; i < count; i++) out.push(pool[i % pool.length])
  return out
}

/** Cycles the loaded conversation pool to reach `count` conversations. */
export function selectConversations(count: number): Conversation[] {
  const pool = cachedConversations
  if (!pool || pool.length === 0) return []
  const out: Conversation[] = []
  for (let i = 0; i < count; i++) out.push(pool[i % pool.length])
  return out
}

interface WorkloadStatus {
  loaded: boolean
  cachedOnDisk: boolean
  source: 'huggingface' | 'none'
  repoId: string
  config: string
  split: string
  count: number
  downloadedAt: number | null
}

function statusFor(workload: HfWorkload): WorkloadStatus {
  const profile = profiles[workload]
  const memMeta = cachedPromptsMeta[workload]
  const diskMeta = readCacheMeta(cacheDirFor(profile.repoId, profile.config, profile.split))
  return {
    loaded: !!memMeta,
    cachedOnDisk: !!diskMeta,
    source: memMeta ? 'huggingface' : 'none',
    repoId: profile.repoId,
    config: profile.config,
    split: profile.split,
    count: memMeta?.count ?? 0,
    downloadedAt: memMeta?.downloadedAt ?? diskMeta?.downloadedAt ?? null,
  }
}

function statusForQa(): WorkloadStatus {
  const profile = profiles.qa
  const diskMeta = readCacheMeta(cacheDirFor(profile.repoId, profile.config, profile.split))
  return {
    loaded: !!cachedConversationsMeta,
    cachedOnDisk: !!diskMeta,
    source: cachedConversationsMeta ? 'huggingface' : 'none',
    repoId: profile.repoId,
    config: profile.config,
    split: profile.split,
    count: cachedConversationsMeta?.count ?? 0,
    downloadedAt: cachedConversationsMeta?.downloadedAt ?? diskMeta?.downloadedAt ?? null,
  }
}

export function getDatasetStatus(): { short: WorkloadStatus; long: WorkloadStatus; qa: WorkloadStatus } {
  return { short: statusFor('short'), long: statusFor('long'), qa: statusForQa() }
}
