/**
 * Piezas compartidas: carga de datos, formularios y tablas.
 *
 * Sin librería de estado de servidor. Con quince pantallas y un usuario a la
 * vez, un hook de treinta líneas alcanza; si la invalidación empieza a doler,
 * entra TanStack Query, que es una dependencia sin transitivas.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export function useDatos<T>(cargar: () => Promise<T>, deps: unknown[] = []): {
  datos: T | null
  error: string | null
  cargando: boolean
  recargar: () => void
} {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [señal, setSeñal] = useState(0)

  useEffect(() => {
    let vigente = true
    setCargando(true)

    cargar()
      .then((d) => {
        if (vigente) {
          setDatos(d)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'no se pudo cargar')
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, señal])

  const recargar = useCallback(() => setSeñal((n) => n + 1), [])

  return { datos, error, cargando, recargar }
}

export function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string
  children: ReactNode
}) {
  return (
    <label>
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}

export function Aviso({ children, clase = '' }: { children: ReactNode; clase?: string }) {
  return <div className={`aviso ${clase}`}>{children}</div>
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="vacio">{children}</p>
}

/**
 * Un número que se puede abrir para ver los movimientos que lo componen (§6.6).
 * Si no hay nada detrás, se muestra como texto plano: no promete lo que no puede.
 */
export function Abrible({
  valor,
  ids,
  alAbrir,
}: {
  valor: string
  ids: string[]
  alAbrir: (ids: string[]) => void
}) {
  if (ids.length === 0) return <>{valor}</>
  return (
    <button type="button" className="abrible" onClick={() => alAbrir(ids)}>
      {valor}
    </button>
  )
}

/** Selector de un registro del catálogo, ordenado por lo más usado. */
export function Selector({
  valor,
  alCambiar,
  opciones,
  vacio = 'Elegir…',
}: {
  valor: string
  alCambiar: (v: string) => void
  opciones: Array<{ id: string; nombre?: string }>
  vacio?: string
}) {
  return (
    <select value={valor} onChange={(e) => alCambiar(e.target.value)}>
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre ?? o.id}
        </option>
      ))}
    </select>
  )
}
