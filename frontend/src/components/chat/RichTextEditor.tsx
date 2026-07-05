import { useEffect, useRef } from 'react'
import clsx from 'clsx'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
}

type Command = 'bold' | 'italic' | 'insertUnorderedList'

interface ToolButton {
  cmd: Command
  label: string
  className?: string
}

const TOOLS: ToolButton[] = [
  { cmd: 'bold', label: 'B', className: 'font-bold' },
  { cmd: 'italic', label: 'I', className: 'italic' },
  { cmd: 'insertUnorderedList', label: '• List' },
]

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder = '',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)

  // Sync external value into the DOM only when it diverges and the editor is not
  // being actively edited — this avoids clobbering the caret on every keystroke.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const isFocused = document.activeElement === el
    if (!isFocused && el.innerHTML !== value) {
      el.innerHTML = value
    }
  }, [value])

  const exec = (cmd: Command) => {
    if (disabled) return
    document.execCommand(cmd, false)
    const el = editorRef.current
    if (el) onChange(el.innerHTML)
  }

  const handleInput = () => {
    const el = editorRef.current
    if (el) onChange(el.innerHTML)
  }

  const isEmpty = value.replace(/<br\s*\/?>|<div><\/div>|\s|&nbsp;/gi, '').length === 0

  return (
    <div className={clsx('flex flex-col gap-1', disabled && 'opacity-50')}>
      <div className="flex items-center gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            disabled={disabled}
            // Keep focus in the editor so execCommand targets the selection.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(t.cmd)}
            className={clsx(
              'px-2 py-0.5 text-[11px] rounded border border-border bg-card text-muted',
              'hover:text-fg hover:border-blue-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              t.className
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          className={clsx(
            'min-h-[5rem] w-full px-2 py-1.5 text-xs text-fg bg-card border border-border rounded',
            'focus:outline-none focus:border-blue-accent overflow-y-auto',
            '[&_ul]:list-disc [&_ul]:pl-4',
            disabled && 'cursor-not-allowed'
          )}
        />
        {isEmpty && (
          <span className="pointer-events-none absolute left-2 top-1.5 text-xs text-muted/60 select-none">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  )
}
