import clsx from 'clsx'

type Category = 'random' | 'shared_prefix' | 'exact_repeat'

interface CategoryPillsProps {
  value: Category
  onChange: (c: Category) => void
  promptCount: number
}

const PILLS: { value: Category; label: string }[] = [
  { value: 'random',        label: 'Random' },
  { value: 'shared_prefix', label: 'Shared Prefix' },
  { value: 'exact_repeat',  label: 'Exact Repeat' },
]

export function CategoryPills({ value, onChange, promptCount }: CategoryPillsProps) {
  return (
    <div className="px-3 py-2 border-t border-border shrink-0">
      <div className="flex gap-1.5 mb-1.5">
        {PILLS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={clsx(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              value === p.value
                ? 'bg-blue-accent text-white'
                : 'bg-card border border-border text-muted hover:text-white hover:border-blue-accent/50'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted">
        {promptCount} prompts loaded · Google Sheets
      </p>
    </div>
  )
}
