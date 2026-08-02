/**
 * Piezas compartidas: carga de datos, formularios y tablas.
 *
 * Sin librería de estado de servidor. Con quince pantallas y un usuario a la
 * vez, un hook de treinta líneas alcanza; si la invalidación empieza a doler,
 * entra TanStack Query, que es una dependencia sin transitivas.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { api } from './api.js'

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

export interface Destino {
  unidadId: string
  tandaId: string
}

/**
 * A qué corresponde una carga: a toda la granja, a un lugar, o a una tanda.
 *
 * Dos listas encadenadas en vez de una sola gigante: primero el lugar, después
 * qué tanda de ese lugar. Con veinte tandas repartidas en cuatro galpones, un
 * único desplegable con todo junto es imposible de usar con una mano.
 *
 * Dejar la tanda en blanco es válido y significa algo distinto de no elegir
 * nada: arreglar el techo del gallinero no es de ninguna tanda, pero tampoco es
 * un gasto general de la granja.
 */
export function SelectorDestino({
  destino,
  alCambiar,
  unidades,
  tandas,
  etiqueta = '¿A qué corresponde?',
  exigirTanda = false,
  alCrearLugar,
}: {
  destino: Destino
  alCambiar: (d: Destino) => void
  unidades: Array<{ id: string; nombre?: string }>
  tandas: Array<{ id: string; nombre?: string; unidadId?: string | null }>
  etiqueta?: string
  exigirTanda?: boolean
  /** Si viene, se puede crear un lugar sin salir de la pantalla. */
  alCrearLugar?: (nombre: string) => Promise<{ id: string }>
}) {
  const [nuevoLugar, setNuevoLugar] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const delLugar = destino.unidadId === '' ? tandas : tandas.filter((t) => t.unidadId === destino.unidadId)

  const crearLugar = async () => {
    if (alCrearLugar === undefined || nuevoLugar === null || nuevoLugar.trim() === '') return
    setCreando(true)
    try {
      const creado = await alCrearLugar(nuevoLugar.trim())
      alCambiar({ unidadId: creado.id, tandaId: '' })
      setNuevoLugar(null)
    } finally {
      setCreando(false)
    }
  }

  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <span style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.3rem' }}>
        {etiqueta}
      </span>

      <div className="fila">
        <Selector
          valor={destino.unidadId}
          alCambiar={(unidadId) => {
            // Cambiar de lugar limpia la tanda: la que estaba elegida es de otro lado.
            const sigueValiendo = tandas.some((t) => t.id === destino.tandaId && t.unidadId === unidadId)
            alCambiar({ unidadId, tandaId: sigueValiendo ? destino.tandaId : '' })
          }}
          opciones={unidades}
          vacio={exigirTanda ? 'Todos los lugares' : 'Toda la granja'}
        />

        <Selector
          valor={destino.tandaId}
          alCambiar={(tandaId) => {
            // Elegir una tanda fija también su lugar, aunque no se haya elegido antes.
            const tanda = tandas.find((t) => t.id === tandaId)
            alCambiar({ tandaId, unidadId: tanda?.unidadId ?? destino.unidadId })
          }}
          opciones={delLugar}
          vacio={destino.unidadId === '' ? 'Sin tanda' : 'Todo el lugar'}
        />
      </div>

      {/* El lugar puede no existir todavía: comprar animales para un galpón
          recién levantado no debería obligar a irse a Configuración primero. */}
      {alCrearLugar !== undefined &&
        (nuevoLugar === null ? (
          <button
            type="button"
            className="chico fantasma"
            style={{ marginTop: '0.4rem' }}
            onClick={() => setNuevoLugar('')}
          >
            + Lugar nuevo
          </button>
        ) : (
          <div className="alta-rapida">
            <span style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
              Nombre del lugar
            </span>
            <input
              value={nuevoLugar}
              onChange={(e) => setNuevoLugar(e.target.value)}
              placeholder="Gallinero 2"
              autoFocus
            />
            <div className="fila" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="principal"
                onClick={() => void crearLugar()}
                disabled={nuevoLugar.trim() === '' || creando}
              >
                {creando ? 'Creando…' : 'Crear y usar'}
              </button>
              <button type="button" className="fantasma" onClick={() => setNuevoLugar(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ))}

      {!exigirTanda && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#999' }}>
          {destino.tandaId !== ''
            ? 'Se carga a esa tanda.'
            : destino.unidadId !== ''
              ? 'Se carga al lugar entero, sin tanda.'
              : 'Se carga como gasto general de la granja.'}
        </p>
      )}
    </div>
  )
}

/**
 * Editar o borrar algo, ahí donde se lo está mirando.
 *
 * No hay una pantalla de configuración: cada cosa se administra donde aparece.
 * El lugar se corrige en el árbol de la granja, el insumo en el depósito, el
 * cliente en la tabla de deudas. Crear ya se hace sobre la marcha al cargar, así
 * que lo único que faltaba era poder corregir un nombre y borrar.
 */
export function EditarRegistro({
  tabla,
  registro,
  campos,
  alCambiar,
  alCerrar,
  puedeBorrar = true,
}: {
  tabla: string
  registro: { id: string } & Record<string, unknown>
  campos: CampoAlta[]
  alCambiar: () => void
  alCerrar: () => void
  puedeBorrar?: boolean
}) {
  const [datos, setDatos] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      campos.map((c) => {
        const actual = registro[c.clave]
        if (c.tipo === 'casilla') return [c.clave, actual === true]
        return [c.clave, actual === null || actual === undefined ? '' : String(actual)]
      }),
    ),
  )
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const guardar = async () => {
    setTrabajando(true)
    setError(null)
    try {
      await api.actualizar(tabla, registro.id, datos)
      alCambiar()
      alCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo guardar')
    } finally {
      setTrabajando(false)
    }
  }

  const borrar = async () => {
    setTrabajando(true)
    setError(null)
    try {
      await api.anular(tabla, registro.id)
      alCambiar()
      alCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo borrar')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="editor">
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
                />
              )}
            </>
          )}
        </div>
      ))}

      {error !== null && <div className="aviso error">{error}</div>}

      {/* Borrar pide confirmación en el mismo lugar: nada se borra de un toque
          accidental, pero tampoco hace falta irse a otra pantalla. */}
      {confirmando ? (
        <div className="aviso">
          <p style={{ margin: '0 0 0.6rem' }}>
            Se saca del listado. Los movimientos que ya tenga siguen contando en los números.
          </p>
          <div className="fila">
            <button type="button" className="principal" onClick={() => void borrar()} disabled={trabajando}>
              Sí, borrar
            </button>
            <button type="button" className="fantasma" onClick={() => setConfirmando(false)}>
              No
            </button>
          </div>
        </div>
      ) : (
        <div className="fila">
          <button type="button" className="principal" onClick={() => void guardar()} disabled={trabajando}>
            {trabajando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="fantasma" onClick={alCerrar}>
            Cancelar
          </button>
          {puedeBorrar && (
            <button
              type="button"
              className="chico fantasma peligro"
              onClick={() => setConfirmando(true)}
              style={{ flex: '0 0 auto', width: 'auto' }}
            >
              Borrar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export interface CampoAlta {
  clave: string
  etiqueta: string
  tipo?: 'texto' | 'numero' | 'opciones' | 'casilla'
  opciones?: Array<{ valor: string; etiqueta: string }>
  inicial?: string | boolean
  sugerencia?: string
  /**
   * Si viene, la lista ofrece "Agregar una nueva" y se puede crear sin salir.
   * Una raza que todavía no existe no debería mandarte a otra pantalla.
   */
  alCrearOpcion?: (nombre: string) => Promise<{ id: string; nombre?: string }>
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
  soloAlta = false,
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
  /** Sin lista propia: la elección se hace en otro lado y acá sólo se da de alta. */
  soloAlta?: boolean
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
        {!soloAlta && (
          <div style={{ flex: 1 }}>
            <Selector valor={valor} alCambiar={alCambiar} opciones={opciones} vacio={vacio} />
          </div>
        )}
        <button
          type="button"
          className={abierto ? 'principal' : 'fantasma'}
          style={soloAlta ? {} : { flex: '0 0 auto', width: 'auto', paddingLeft: '1rem', paddingRight: '1rem' }}
          onClick={() => setAbierto(!abierto)}
          aria-label={textoAlta}
        >
          {abierto ? 'Cancelar' : soloAlta ? textoAlta : '+'}
        </button>
      </div>

      {!soloAlta && opciones.length === 0 && !abierto && (
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
                    <CampoOpciones
                      campo={c}
                      valor={String(datos[c.clave] ?? '')}
                      alCambiar={(v) => setDatos({ ...datos, [c.clave]: v })}
                    />
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

/**
 * Una lista de opciones que además puede crear una nueva.
 *
 * Se usa donde el vocabulario todavía se está armando: la raza de los pollitos
 * que acabás de comprar puede no existir, y mandarte a otra pantalla a crearla
 * es exactamente lo que hace que la carga se abandone.
 */
function CampoOpciones({
  campo,
  valor,
  alCambiar,
}: {
  campo: CampoAlta
  valor: string
  alCambiar: (v: string) => void
}) {
  const [nuevo, setNuevo] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const crear = async () => {
    if (campo.alCrearOpcion === undefined || nuevo === null || nuevo.trim() === '') return
    setCreando(true)
    try {
      const creado = await campo.alCrearOpcion(nuevo.trim())
      alCambiar(creado.id)
      setNuevo(null)
    } finally {
      setCreando(false)
    }
  }

  if (nuevo !== null) {
    return (
      <div>
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder={campo.sugerencia ?? 'Nombre'}
          autoFocus
        />
        <div className="fila" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="principal chico"
            onClick={() => void crear()}
            disabled={nuevo.trim() === '' || creando}
          >
            {creando ? 'Creando…' : 'Agregar'}
          </button>
          <button type="button" className="fantasma chico" onClick={() => setNuevo(null)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <select
      value={valor}
      onChange={(e) => {
        if (e.target.value === '__nueva__') setNuevo('')
        else alCambiar(e.target.value)
      }}
    >
      {(campo.opciones ?? []).map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
      {campo.alCrearOpcion !== undefined && <option value="__nueva__">+ Agregar una nueva…</option>}
    </select>
  )
}
