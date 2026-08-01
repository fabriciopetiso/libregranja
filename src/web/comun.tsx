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

export interface CampoAlta {
  clave: string
  etiqueta: string
  tipo?: 'texto' | 'numero' | 'opciones' | 'casilla'
  opciones?: Array<{ valor: string; etiqueta: string }>
  inicial?: string | boolean
  sugerencia?: string
}

/**
 * Selector con alta al lado.
 *
 * Si el insumo que estás comprando no existe todavía, se crea acá mismo y queda
 * elegido, sin salir de la pantalla ni perder lo que ya escribiste (§5.1). Tener
 * que ir a Configuración, crearlo, volver y empezar de nuevo es exactamente lo
 * que hace que una app de carga no se use.
 */
export function SelectorConAlta({
  etiqueta,
  valor,
  alCambiar,
  opciones,
  campos,
  fijos = {},
  alCrear,
  vacio = 'Elegir…',
  textoAlta = 'Crear uno nuevo',
}: {
  etiqueta: string
  valor: string
  alCambiar: (v: string) => void
  opciones: Array<{ id: string; nombre?: string }>
  campos: CampoAlta[]
  fijos?: Record<string, unknown>
  alCrear: (datos: Record<string, unknown>) => Promise<{ id: string } | null>
  vacio?: string
  textoAlta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [datos, setDatos] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(campos.map((c) => [c.clave, c.inicial ?? (c.tipo === 'casilla' ? false : '')])),
  )

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const creado = await alCrear({ ...fijos, ...datos })
      if (creado !== null) {
        alCambiar(creado.id)
        setAbierto(false)
        setDatos(Object.fromEntries(campos.map((c) => [c.clave, c.inicial ?? (c.tipo === 'casilla' ? false : '')])))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo crear')
    } finally {
      setGuardando(false)
    }
  }

  const nombre = String(datos['nombre'] ?? '')

  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <span style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.3rem' }}>{etiqueta}</span>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <Selector valor={valor} alCambiar={alCambiar} opciones={opciones} vacio={vacio} />
        </div>
        <button
          type="button"
          className={abierto ? 'principal' : 'fantasma'}
          style={{ flex: '0 0 auto', width: 'auto', paddingLeft: '1rem', paddingRight: '1rem' }}
          onClick={() => setAbierto(!abierto)}
          aria-label={textoAlta}
        >
          {abierto ? '×' : '+'}
        </button>
      </div>

      {opciones.length === 0 && !abierto && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: '#a05a00' }}>
          No hay ninguno cargado. Tocá <strong>+</strong> para crear el primero.
        </p>
      )}

      {abierto && (
        <div className="alta-rapida">
          {campos.map((c) => (
            <div key={c.clave} style={{ marginBottom: '0.7rem' }}>
              {c.tipo === 'casilla' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={datos[c.clave] === true}
                    onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.checked })}
                    style={{ width: 'auto', minHeight: 0 }}
                  />
                  <span style={{ margin: 0 }}>{c.etiqueta}</span>
                </label>
              ) : (
                <>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                    {c.etiqueta}
                  </span>
                  {c.tipo === 'opciones' ? (
                    <select
                      value={String(datos[c.clave] ?? '')}
                      onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })}
                    >
                      {(c.opciones ?? []).map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.etiqueta}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={String(datos[c.clave] ?? '')}
                      onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })}
                      {...(c.tipo === 'numero' ? { inputMode: 'numeric' as const } : {})}
                      {...(c.sugerencia !== undefined ? { placeholder: c.sugerencia } : {})}
                      autoFocus={c.clave === 'nombre'}
                    />
                  )}
                </>
              )}
            </div>
          ))}

          {error !== null && <div className="aviso error">{error}</div>}

          <button
            type="button"
            className="principal"
            onClick={() => void guardar()}
            disabled={nombre.trim() === '' || guardando}
          >
            {guardando ? 'Creando…' : 'Crear y usar'}
          </button>
        </div>
      )}
    </div>
  )
}
