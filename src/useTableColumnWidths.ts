import { useCallback, useEffect, useState } from 'react'

interface UseColumnWidthsOptions {
  /** Persist widths to localStorage under `columnWidths:{persist}` */
  persist?: string
}

interface RegisterOptions {
  /** Default width. Number for pixels, string for CSS grid values (e.g. '1fr'). */
  defaultValue?: number | string
  /** Store resized widths as fr values instead of pixels. Default: false */
  relative?: boolean
}

function loadPersisted(key: string): Record<string, number | string> | null {
  try {
    const raw = localStorage.getItem(`columnWidths:${key}`)
    return raw ? (JSON.parse(raw) as Record<string, number | string>) : null
  } catch {
    return null
  }
}

export function useTableColumnWidths(options?: UseColumnWidthsOptions) {
  const persistKey = options?.persist

  const [widths, setWidths] = useState<Record<string, number | string>>(
    () => (persistKey ? loadPersisted(persistKey) : null) ?? {},
  )

  useEffect(() => {
    if (persistKey) {
      localStorage.setItem(`columnWidths:${persistKey}`, JSON.stringify(widths))
    }
  }, [widths, persistKey])

  const register = useCallback(
    (key: string, registerOptions?: RegisterOptions) => ({
      width: widths[key] ?? registerOptions?.defaultValue,
      resizable: true as const,
      onResizeEnd: (
        width: number,
        _startWidth: number,
        frValue: number,
      ) => {
        if (registerOptions?.relative) {
          setWidths((prev) => ({
            ...prev,
            [key]: `${parseFloat(frValue.toFixed(2))}fr`,
          }))
        } else {
          setWidths((prev) => ({ ...prev, [key]: width }))
        }
      },
    }),
    [widths],
  )

  const reset = useCallback(() => {
    setWidths({})
    if (persistKey) {
      localStorage.removeItem(`columnWidths:${persistKey}`)
    }
  }, [persistKey])

  return { register, reset }
}
