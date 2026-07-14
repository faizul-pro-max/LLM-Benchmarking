import type { RunConfig, ServerConfigSnapshot } from '@/types/experiment'
import { fmtGB } from '@/utils/formatters'

/** Safely parse a run's `config` JSON string (may be empty / malformed on old rows). */
export function parseRunConfig(config: string | null | undefined): RunConfig | null {
  if (!config) return null
  try {
    const parsed = JSON.parse(config)
    if (parsed && typeof parsed === 'object') return parsed as RunConfig
    return null
  } catch {
    return null
  }
}

function dash(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—'
  return String(v)
}

function boolLabel(v: boolean | null | undefined): string {
  if (v == null) return '—'
  return v ? 'on' : 'off'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-[13px] font-mono text-fg truncate" title={value}>
        {value}
      </span>
    </div>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  random: 'random',
  shared_prefix: 'shared prefix',
  exact_repeat: 'exact repeat',
}

const WORKLOAD_LABELS: Record<string, string> = {
  short: 'Short',
  long: 'Long',
  qa: 'Q&A',
}

function workloadLabel(config: RunConfig): string {
  const workload = config.workload ?? 'short'
  const base = WORKLOAD_LABELS[workload] ?? dash(workload)
  return workload === 'qa' ? `${base} (${config.qaMode ?? 'sequential'})` : base
}

/** Task 1.2 — the benchmark run parameters (concurrency / prompt count / workload / category). */
export function RunConfigPanel({ config }: { config: RunConfig | null }) {
  if (!config) return null
  return (
    <div className="px-4 py-3 border-t border-border">
      <h3 className="text-[11px] font-semibold text-fg mb-2">Run Config</h3>
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Concurrency</span>
          <span className="text-lg font-bold text-fg leading-none">{dash(config.concurrency)}</span>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Prompt Count</span>
          <span className="text-lg font-bold text-fg leading-none">{dash(config.promptCount)}</span>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Workload</span>
          <span className="text-lg font-bold text-fg leading-none">{workloadLabel(config)}</span>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Category</span>
          <span className="text-lg font-bold text-fg leading-none">
            {CATEGORY_LABELS[config.category] ?? dash(config.category)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Task 1.1 — the LLM server this run executed against (snapshotted at run start). */
export function ServerConfigPanel({ server }: { server: ServerConfigSnapshot | undefined }) {
  const runtime = server?.runtime

  return (
    <div className="px-4 py-3 border-t border-border">
      <h3 className="text-[11px] font-semibold text-fg mb-2">LLM Server</h3>
      {!server ? (
        <div className="text-xs text-muted">No server snapshot recorded for this run.</div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Model" value={dash(server.model_name)} />
            <Field label="Served Model ID" value={dash(server.served_model_id)} />
            <Field label="vLLM Version" value={dash(server.vllm_version)} />
            <Field label="vLLM URL" value={dash(server.vllm_url)} />
            <Field label="GPU" value={dash(server.gpu_name)} />
            <Field
              label="VRAM Total"
              value={server.vram_total_mb != null ? fmtGB(server.vram_total_mb) : '—'}
            />
            <Field label="Max Model Len" value={dash(server.max_model_len)} />
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">
              Runtime Flags
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
              <Field label="Prefix Caching" value={boolLabel(runtime?.enable_prefix_caching)} />
              <Field
                label="GPU Mem Util"
                value={
                  runtime?.gpu_memory_utilization != null
                    ? String(runtime.gpu_memory_utilization)
                    : '—'
                }
              />
              <Field label="Block Size" value={dash(runtime?.block_size)} />
              <Field label="KV Cache Dtype" value={dash(runtime?.kv_cache_dtype)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Task 3 — first-party rich-text (HTML) description authored via the run editor. */
export function DescriptionPanel({ html }: { html: string | null | undefined }) {
  const trimmed = html?.trim()
  if (!trimmed) return null
  return (
    <div className="px-4 py-3 border-t border-border">
      <h3 className="text-[11px] font-semibold text-fg mb-2">Description</h3>
      <div
        className="bench-prose text-sm text-fg leading-relaxed bg-card border border-border rounded-lg p-4
                   [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                   [&_li]:mb-1 [&_a]:text-blue-accent [&_a]:underline [&_strong]:font-semibold
                   [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-2
                   [&_code]:font-mono [&_code]:text-[13px]"
        dangerouslySetInnerHTML={{ __html: trimmed }}
      />
    </div>
  )
}
