import fs from 'fs'
import path from 'path'

export interface Prompt {
  id: string
  text: string
  category: string
}

const LOCAL_PROMPTS: Prompt[] = [
  { id: 'p001', text: 'Explain KV cache in simple terms for a developer.', category: 'random' },
  { id: 'p002', text: 'What is speculative decoding and why does it matter?', category: 'random' },
  { id: 'p003', text: 'Compare prefill vs decode phase in LLM inference.', category: 'random' },
  { id: 'p004', text: 'How does paged attention reduce memory fragmentation?', category: 'random' },
  { id: 'p005', text: 'Describe the difference between TTFT and TPOT.', category: 'random' },
  { id: 'p006', text: 'What is tensor parallelism in large model serving?', category: 'shared_prefix' },
  { id: 'p007', text: 'What is pipeline parallelism in large model serving?', category: 'shared_prefix' },
  { id: 'p008', text: 'What is sequence parallelism in large model serving?', category: 'shared_prefix' },
  { id: 'p009', text: 'Explain quantization and its effect on model quality.', category: 'random' },
  { id: 'p010', text: 'How does continuous batching improve GPU utilization?', category: 'random' },
  { id: 'p011', text: 'What are CUDA graphs and how do they help inference?', category: 'exact_repeat' },
  { id: 'p012', text: 'What are CUDA graphs and how do they help inference?', category: 'exact_repeat' },
  { id: 'p013', text: 'Explain FP8 vs INT8 quantization tradeoffs.', category: 'random' },
  { id: 'p014', text: 'How does prefix caching reduce TTFT for shared prompts?', category: 'shared_prefix' },
  { id: 'p015', text: 'How does prefix caching reduce latency for repeated prompts?', category: 'shared_prefix' },
  { id: 'p016', text: 'What is chunked prefill and when should you use it?', category: 'random' },
  { id: 'p017', text: 'Explain the vLLM scheduler and its scheduling policies.', category: 'random' },
  { id: 'p018', text: 'What is token budget forcing in LLM inference?', category: 'random' },
  { id: 'p019', text: 'How does AWQ quantization differ from GPTQ?', category: 'random' },
  { id: 'p020', text: 'What hardware is best for running 70B parameter models?', category: 'random' },
  { id: 'p021', text: 'Explain flash attention and its memory efficiency.', category: 'random' },
  { id: 'p022', text: 'How does SGLang differ from vLLM in architecture?', category: 'random' },
]

let cachedPrompts: Prompt[] | null = null

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
      return { prompts: cachedPrompts, source: 'sheets' }
    } catch (err) {
      console.log({ msg: 'Sheets load failed, falling back to local', err: String(err) })
    }
  }

  cachedPrompts = LOCAL_PROMPTS
  return { prompts: cachedPrompts, source: 'local' }
}

export function getCachedPrompts(): Prompt[] {
  return cachedPrompts ?? LOCAL_PROMPTS
}
