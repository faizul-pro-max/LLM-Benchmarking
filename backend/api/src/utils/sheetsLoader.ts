import fs from 'fs'
import path from 'path'

export interface Prompt {
  id: string
  text: string
  category: string
  /** Flattened Q&A mode only (see loadGenerator.ts flattenConversations):
   *  which conversation this turn was baked from. */
  conversation_id?: string
  /** Flattened Q&A mode only: 0-based turn position within its conversation. */
  turn_index?: number
}

export type PromptCategory = 'random' | 'shared_prefix' | 'exact_repeat'

// A long, fixed context block shared by every `shared_prefix` prompt. Reusing
// an identical leading span is exactly what lets vLLM's prefix cache skip the
// prefill for the shared portion — so these prompts actually exercise that path.
const SHARED_PREFIX =
  'You are a senior GPU inference engineer. You specialise in vLLM, SGLang, ' +
  'paged attention, KV cache management, continuous batching, and CUDA graph ' +
  'capture for large language model serving. Answer the following question for ' +
  'a technical audience, concisely and with concrete numbers where possible. ' +
  'Question: '

// The single canonical prompt sent over and over for `exact_repeat`. Identical
// text every time means identical token ids — the strongest possible cache hit.
const EXACT_REPEAT_PROMPT =
  'Explain, step by step, how paged attention reduces KV cache memory ' +
  'fragmentation in vLLM, and why that improves throughput under high concurrency.'

const RANDOM_PROMPTS: string[] = [
  'Explain KV cache in simple terms for a developer.',
  'What is speculative decoding and why does it matter?',
  'Compare prefill vs decode phase in LLM inference.',
  'How does paged attention reduce memory fragmentation?',
  'Describe the difference between TTFT and TPOT.',
  'Explain quantization and its effect on model quality.',
  'How does continuous batching improve GPU utilization?',
  'Explain FP8 vs INT8 quantization tradeoffs.',
  'What is chunked prefill and when should you use it?',
  'Explain the vLLM scheduler and its scheduling policies.',
  'What is token budget forcing in LLM inference?',
  'How does AWQ quantization differ from GPTQ?',
  'What hardware is best for running 70B parameter models?',
  'Explain flash attention and its memory efficiency.',
  'How does SGLang differ from vLLM in architecture?',
]

// Distinct question tails that all hang off SHARED_PREFIX. The prefix is shared;
// only these short suffixes differ between requests.
const SHARED_PREFIX_SUFFIXES: string[] = [
  'What is tensor parallelism in large model serving?',
  'What is pipeline parallelism in large model serving?',
  'What is sequence parallelism in large model serving?',
  'How does prefix caching reduce TTFT for shared prompts?',
  'When does enabling chunked prefill help or hurt latency?',
  'How do CUDA graphs reduce per-step launch overhead?',
]

function buildLocalPrompts(): Prompt[] {
  const random: Prompt[] = RANDOM_PROMPTS.map((text, i) => ({
    id: `rnd-${String(i + 1).padStart(3, '0')}`,
    text,
    category: 'random',
  }))

  const sharedPrefix: Prompt[] = SHARED_PREFIX_SUFFIXES.map((suffix, i) => ({
    id: `shp-${String(i + 1).padStart(3, '0')}`,
    text: SHARED_PREFIX + suffix,
    category: 'shared_prefix',
  }))

  const exactRepeat: Prompt[] = [
    { id: 'exr-001', text: EXACT_REPEAT_PROMPT, category: 'exact_repeat' },
  ]

  return [...random, ...sharedPrefix, ...exactRepeat]
}

const LOCAL_PROMPTS: Prompt[] = buildLocalPrompts()

let cachedPrompts: Prompt[] | null = null
let cachedSource: 'sheets' | 'local' = 'local'

export async function loadPrompts(): Promise<{ prompts: Prompt[]; source: 'sheets' | 'local' }> {
  const sheetsId = process.env.GOOGLE_SHEETS_ID
  const keyFile  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

  if (sheetsId && keyFile && fs.existsSync(path.resolve(keyFile))) {
    try {
      const { google } = await import('googleapis')
      const auth = new google.auth.GoogleAuth({
        keyFile: path.resolve(keyFile),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      })
      const sheets = google.sheets({ version: 'v4', auth })
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetsId,
        range: 'Prompts!A2:C',
      })
      const rows = res.data.values ?? []
      cachedPrompts = rows.map((r, i) => ({
        id: r[0] ?? `p${String(i + 1).padStart(3, '0')}`,
        text: r[1] ?? '',
        category: r[2] ?? 'random',
      })).filter((p) => p.text)
      cachedSource = 'sheets'
      return { prompts: cachedPrompts, source: 'sheets' }
    } catch (err) {
      console.log({ msg: 'Sheets load failed, falling back to local', err: String(err) })
    }
  }

  cachedPrompts = LOCAL_PROMPTS
  cachedSource = 'local'
  return { prompts: cachedPrompts, source: 'local' }
}

export function getCachedPrompts(): Prompt[] {
  return cachedPrompts ?? LOCAL_PROMPTS
}

/** Where the cached prompts came from on the last load. */
export function getPromptSource(): 'sheets' | 'local' {
  return cachedSource
}

/** Per-category counts of the loaded prompt pool, plus source/total. Drives the
 *  real "N prompts · source" label in the UI instead of a hardcoded string. */
export function getPromptsInfo(): {
  source: 'sheets' | 'local'
  total: number
  byCategory: Record<string, number>
} {
  const all = getCachedPrompts()
  const byCategory: Record<string, number> = {}
  for (const p of all) byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
  return { source: cachedSource, total: all.length, byCategory }
}

/**
 * Build the list of prompts for a run, honouring the user's category selection.
 *
 * - Filters the pool to the chosen category (falls back to the whole pool only
 *   if a category has no prompts at all, so a run never starts empty).
 * - Cycles through that pool to reach `count` requests, so concurrency/promptCount
 *   still drive real load. For `exact_repeat` the pool is a single prompt, so this
 *   naturally sends the identical prompt `count` times.
 */
export function selectPrompts(category: string, count: number): Prompt[] {
  const all = getCachedPrompts()
  const pool = all.filter((p) => p.category === category)
  const base = pool.length > 0 ? pool : all
  if (base.length === 0) return []

  const out: Prompt[] = []
  for (let i = 0; i < count; i++) {
    out.push(base[i % base.length])
  }
  return out
}
