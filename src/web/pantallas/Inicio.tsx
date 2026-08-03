/**
 * La pantalla principal: qué tengo y cómo me fue.
 *
 * Una sola, no dos. Separar "estado" de "números" era una división mía sin
 * fundamento: quien abre la app quiere ver el stock, los animales y la plata
 * del mes en la misma vista, no elegir pestaña según qué pregunta tenga.
 *
 * Arriba lo que hay ahora, que no depende de fechas. Abajo lo que pasó en el
 * período elegido. Y cualquier número se toca para llegar a los movimientos
 * que lo forman.
 */

import { useState } from 'react'

import { api } from '../api.js'
import type { AnimalApi, EstadoApi, MovimientoApi, Registro, UnidadApi } from '../api.js'
import { Abrible, Aviso, Campo, EditarRegistro, Selector, useDatos, Vacio } from '../comun.js'
import { entero, hoy, mesEnCurso, pesos, pesosExactos } from '../dinero.js'

type Tanda = EstadoApi['tandas'][number]

export function Inicio() {
  const inicial = mesEnCurso()
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<string[] | null>(null)

  const estado = useDatos(() => api.estado())
  const animales = useDatos(() => api.animales())
  const especies = useDatos(() => api.listar('especie'))
  const razas = useDatos(() => api.listar('raza'))
  const tipos = useDatos(() => api.listar('categoria'))

  const rango = { desde, hasta }
  const resultado = useDatos(() => api.resultado(rango), [desde, hasta])
  const rubros = useDatos(() => api.rubros(rango), [desde, hasta])
  const ventas = useDatos(() => api.ventas(rango), [desde, hasta])
  const nombres = useDatos(async () => {
    const listas = await Promise.all([
      api.listar('insumo'),
      api.listar('producto'),
      api.listar('rubro_gasto'),
      api.listar('contraparte'),
    ])
    const mapa = new Map<string, string>()
    for (const lista of listas) for (const r of lista as Registro[]) mapa.set(r.id, (r['nombre'] as string) ?? r.id)
    return mapa
  }, [])

  if (estado.cargando) return <Vacio>Cargando…</Vacio>
  if (estado.error !== null) return <Aviso clase="error">{estado.error}</Aviso>
  if (estado.datos === null) return null

  const datos = estado.datos
  const recargar = () => {
    estado.recargar()
    animales.recargar()
  }
  const nombre = (id: string): string => nombres.datos?.get(id) ?? id

  const alternar = (id: string) =>
    setAbiertos((previos) => {
      const nuevos = new Set(previos)
      if (nuevos.has(id)) nuevos.delete(id)
      else nuevos.add(id)
      return nuevos
    })

  const activas = datos.tandas.filter((t) => !t.cerrada)
  const raices = datos.unidades.filter((u) => u.unidadPadreId === null)
  const sinLugar = activas.filter((t) => t.unidadId === null)
  const valorDeposito = datos.deposito.reduce((s, d) => s + BigInt(d.centavos), 0n)
  const cerradas = datos.tandas.length - activas.length

  const comun = {
    editando,
    alEditar: setEditando,
    recargar,
    opciones: {
      unidades: datos.unidades as unknown as Registro[],
      especies: (especies.datos ?? []) as Registro[],
      razas: (razas.datos ?? []) as Registro[],
      tipos: (tipos.datos ?? []) as Registro[],
      animales: animales.datos ?? [],
    },
  }

  return (
    <>
      {/* Lo primero que se ve: cuánto hay y cómo viene el mes. */}
      <section className="tarjeta encabezado">
        <div className="cifras">
          <div>
            <span className="cifra">{entero(datos.totales.animales)}</span>
            <span className="rotulo-cifra">animales</span>
          </div>
          {BigInt(datos.totales.huevos) !== 0n && (
            <div>
              <span className="cifra">{entero(datos.totales.huevos)}</span>
              <span className="rotulo-cifra">huevos</span>
            </div>
          )}
          {resultado.datos !== null && (
            <div>
              <span className={`cifra ${BigInt(resultado.datos.diferencia) < 0n ? 'malo' : 'bueno'}`}>
                {pesos(resultado.datos.diferencia)}
              </span>
              <span className="rotulo-cifra">en el período</span>
            </div>
          )}
        </div>
      </section>

      {datos.avisos.length > 0 && (
        <section className="tarjeta">
          <h2>Avisos</h2>
          {datos.avisos.map((a, i) => (
            <Aviso key={i}>{a.detalle}</Aviso>
          ))}
        </section>
      )}

      <section className="tarjeta">
        <h2>La granja</h2>

        {raices.length === 0 && sinLugar.length === 0 ? (
          <Vacio>
            Todavía no hay nada cargado. <a href="/comenzar">Empezar por acá</a>
          </Vacio>
        ) : (
          <div className="arbol">
            {raices.map((u) => (
              <Rama
                key={u.id}
                unidad={u}
                todas={datos.unidades}
                tandas={activas}
                nivel={0}
                abiertos={abiertos}
                alAlternar={alternar}
                {...comun}
              />
            ))}

            {sinLugar.length > 0 && (
              <div className="nodo">
                <div className="fila-nodo">
                  <span className="nombre-nodo sin-lugar">Sin lugar asignado</span>
                </div>
                {sinLugar.map((t) => (
                  <FilaTanda key={t.id} tanda={t} nivel={1} {...comun} />
                ))}
              </div>
            )}
          </div>
        )}

        {cerradas > 0 && (
          <p className="apagado" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
            {cerradas} tanda{cerradas === 1 ? '' : 's'} cerrada{cerradas === 1 ? '' : 's'}: se vendieron o se
            trasladaron enteras. Sus números siguen contando abajo.
          </p>
        )}
      </section>

      <section className="tarjeta">
        <h2>Depósito</h2>

        {datos.deposito.length === 0 ? (
          <Vacio>Sin insumos. Se crean al registrar una compra.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th className="numero">Quedan</th>
                <th className="numero">Por bolsa</th>
                <th className="numero">Valor</th>
              </tr>
            </thead>
            <tbody>
              {datos.deposito.map((d) => (
                <>
                  <tr key={d.id}>
                    <td>
                      <button type="button" className="editable" onClick={() => setEditando(`insumo:${d.id}`)}>
                        {d['nombre'] as string}
                      </button>
                    </td>
                    <td className="numero">{entero(d.unidades)}</td>
                    <td className="numero">{pesosExactos(d.costoUnitario)}</td>
                    <td className="numero">{pesos(d.centavos)}</td>
                  </tr>
                  {editando === `insumo:${d.id}` && (
                    <tr key={`${d.id}-e`}>
                      <td colSpan={4}>
                        <EditarRegistro
                          tabla="insumo"
                          registro={d}
                          campos={[
                            { clave: 'nombre', etiqueta: 'Nombre' },
                            { clave: 'gramosPorBolsa', etiqueta: 'Gramos por bolsa', tipo: 'numero' },
                          ]}
                          alCambiar={recargar}
                          alCerrar={() => setEditando(null)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              <tr className="total">
                <td>Valor del depósito</td>
                <td />
                <td />
                <td className="numero">{pesos(valorDeposito)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* --- de acá para abajo, todo depende del período --- */}

      <section className="tarjeta">
        <h2>El período</h2>
        <div className="fila">
          <Campo etiqueta="Desde">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hasta">
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
        </div>

        {resultado.datos !== null && (
          <table>
            <tbody>
              <tr>
                <td>Entró</td>
                <td className="numero">{pesos(resultado.datos.ventas)}</td>
              </tr>
              <tr>
                <td>Salió</td>
                <td className="numero">{pesos(resultado.datos.gastos)}</td>
              </tr>
              <tr className="total">
                <td>Diferencia</td>
                <td className="numero">{pesos(resultado.datos.diferencia)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <a className="descarga" href={`/api/v1/export.csv?desde=${desde}&hasta=${hasta}`} download>
          ⭳ Bajar todas las cargas del período
        </a>
      </section>

      <section className="tarjeta">
        <h2>En qué se fue</h2>
        {rubros.datos === null || rubros.datos.filas.length === 0 ? (
          <Vacio>Sin gastos en el período.</Vacio>
        ) : (
          <table>
            <tbody>
              {rubros.datos.filas.map((f) => (
                <tr key={f.refId}>
                  <td>{nombre(f.refId)}</td>
                  <td className="numero">
                    <Abrible valor={pesos(f.centavos)} ids={f.movimientoIds} alAbrir={setDetalle} />
                  </td>
                  <td className="numero apagado">{f.participacion === null ? '' : `${f.participacion}%`}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                <td className="numero">{pesos(rubros.datos.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="tarjeta">
        <h2>Qué se vendió</h2>
        {ventas.datos === null || ventas.datos.filas.length === 0 ? (
          <Vacio>Sin ventas en el período.</Vacio>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="numero">Cant.</th>
                  <th className="numero">Importe</th>
                </tr>
              </thead>
              <tbody>
                {ventas.datos.filas.map((f) => (
                  <tr key={f.refId}>
                    <td>{nombre(f.refId)}</td>
                    <td className="numero">{entero(f.cantidad)}</td>
                    <td className="numero">
                      <Abrible valor={pesos(f.centavos)} ids={f.movimientoIds} alAbrir={setDetalle} />
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total</td>
                  <td />
                  <td className="numero">{pesos(ventas.datos.total)}</td>
                </tr>
              </tbody>
            </table>

            {ventas.datos.deuda.filas.length > 0 && (
              <>
                <h2 style={{ marginTop: '1.5rem' }}>Quién debe</h2>
                <table>
                  <tbody>
                    {ventas.datos.deuda.filas.map((d) => (
                      <tr key={d.contraparteId}>
                        <td>{nombre(d.contraparteId)}</td>
                        <td className="numero">{pesos(d.saldo)}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Total adeudado</td>
                      <td className="numero">{pesos(ventas.datos.deuda.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </section>

      {detalle !== null && <Detalle ids={detalle} alCerrar={() => setDetalle(null)} nombre={nombre} />}
    </>
  )
}

interface Comun {
  editando: string | null
  alEditar: (v: string | null) => void
  recargar: () => void
  opciones: {
    unidades: Registro[]
    especies: Registro[]
    razas: Registro[]
    tipos: Registro[]
    animales: AnimalApi[]
  }
}

function Rama({
  unidad,
  todas,
  tandas,
  nivel,
  abiertos,
  alAlternar,
  editando,
  alEditar,
  recargar,
  opciones,
}: {
  unidad: UnidadApi
  todas: UnidadApi[]
  tandas: Tanda[]
  nivel: number
  abiertos: Set<string>
  alAlternar: (id: string) => void
} & Comun) {
  const hijas = todas.filter((u) => u.unidadPadreId === unidad.id)
  const suyas = tandas.filter((t) => t.unidadId === unidad.id)
  const cerrado = abiertos.has(unidad.id)
  const tieneAlgo = hijas.length > 0 || suyas.length > 0
  const especies = Object.entries(unidad.animalesPorEspecie)
  const clave = `unidad:${unidad.id}`

  return (
    <div className="nodo">
      <div className="fila-nodo" style={{ paddingLeft: `${nivel * 1.1}rem` }}>
        <button
          type="button"
          className="plegar"
          onClick={() => alAlternar(unidad.id)}
          disabled={!tieneAlgo}
          aria-label={cerrado ? 'Desplegar' : 'Plegar'}
        >
          {tieneAlgo ? (cerrado ? '▸' : '▾') : '·'}
        </button>

        <button type="button" className="nombre-nodo editable" onClick={() => alEditar(clave)}>
          {unidad.nombre}
        </button>

        <span className="datos-nodo">
          {BigInt(unidad.animales) > 0n && (
            <span className="chip">
              {entero(unidad.animales)}
              {especies.length > 1 && (
                <span className="apagado"> · {especies.map(([e, n]) => `${n} ${e.toLowerCase()}`).join(', ')}</span>
              )}
            </span>
          )}
          {BigInt(unidad.huevos) > 0n && <span className="chip huevos">{entero(unidad.huevos)} hv</span>}
          {BigInt(unidad.costoCentavos) !== 0n && (
            <span className="chip apagado">{pesos(unidad.costoCentavos)}</span>
          )}
        </span>
      </div>

      {editando === clave && (
        <div style={{ paddingLeft: `${nivel * 1.1 + 1.6}rem` }}>
          <EditarRegistro
            tabla="unidad"
            registro={unidad}
            campos={[
              { clave: 'nombre', etiqueta: 'Nombre del lugar' },
              {
                clave: 'unidadPadreId',
                etiqueta: '¿Está dentro de otro lugar?',
                tipo: 'opciones',
                opciones: [
                  { valor: '', etiqueta: 'No, cuelga de la granja' },
                  ...opciones.unidades
                    .filter((u) => u.id !== unidad.id)
                    .map((u) => ({ valor: u.id, etiqueta: (u['nombre'] as string) ?? u.id })),
                ],
              },
            ]}
            alCambiar={recargar}
            alCerrar={() => alEditar(null)}
          />
        </div>
      )}

      {!cerrado && (
        <>
          {hijas.map((h) => (
            <Rama
              key={h.id}
              unidad={h}
              todas={todas}
              tandas={tandas}
              nivel={nivel + 1}
              abiertos={abiertos}
              alAlternar={alAlternar}
              editando={editando}
              alEditar={alEditar}
              recargar={recargar}
              opciones={opciones}
            />
          ))}
          {suyas.map((t) => (
            <FilaTanda
              key={t.id}
              tanda={t}
              nivel={nivel + 1}
              editando={editando}
              alEditar={alEditar}
              recargar={recargar}
              opciones={opciones}
            />
          ))}
        </>
      )}
    </div>
  )
}

function FilaTanda({
  tanda,
  nivel,
  editando,
  alEditar,
  recargar,
  opciones,
}: { tanda: Tanda; nivel: number } & Comun) {
  const clave = `tanda:${tanda.id}`
  const suyos = opciones.animales.filter((a) => a.tandaId === tanda.id)
  const llevaNombres = tanda.categoria?.['animalesConNombre'] === true

  return (
    <>
      <div className="fila-nodo tanda" style={{ paddingLeft: `${nivel * 1.1 + 1.6}rem` }}>
        <button type="button" className="nombre-nodo editable" onClick={() => alEditar(clave)}>
          {tanda['nombre'] as string}
          <span className="detalle-tanda">
            {[tanda.categoria?.['nombre'] as string | undefined, `${tanda.diasAbierta} días`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </button>

        <span className="datos-nodo">
          {tanda.incubacion !== null && <span className="chip etapa">{rotuloEtapa(tanda.incubacion.etapa)}</span>}
          {BigInt(tanda.animales) !== 0n && <span className="chip">{entero(tanda.animales)}</span>}
          {BigInt(tanda.huevos) !== 0n && <span className="chip huevos">{entero(tanda.huevos)} hv</span>}
          {BigInt(tanda.costoCentavos) !== 0n && (
            <span className="chip apagado">{pesos(tanda.costoCentavos)}</span>
          )}
        </span>
      </div>

      {tanda.incubacion !== null && <Incubacion datos={tanda.incubacion} nivel={nivel} />}

      {editando === clave && (
        <div style={{ paddingLeft: `${nivel * 1.1 + 1.6}rem` }}>
          <EditarRegistro
            tabla="tanda"
            registro={tanda as unknown as { id: string } & Record<string, unknown>}
            campos={[
              { clave: 'nombre', etiqueta: 'Nombre de la tanda' },
              {
                clave: 'unidadId',
                etiqueta: '¿En qué lugar?',
                tipo: 'opciones',
                opciones: [
                  { valor: '', etiqueta: 'Sin lugar' },
                  ...opciones.unidades.map((u) => ({ valor: u.id, etiqueta: (u['nombre'] as string) ?? u.id })),
                ],
              },
              {
                clave: 'categoriaId',
                etiqueta: '¿Para qué es?',
                tipo: 'opciones',
                opciones: [
                  { valor: '', etiqueta: 'Sin definir' },
                  ...opciones.tipos.map((t) => ({ valor: t.id, etiqueta: (t['nombre'] as string) ?? t.id })),
                ],
              },
              {
                clave: 'razaId',
                etiqueta: 'Raza',
                tipo: 'opciones',
                opciones: [
                  { valor: '', etiqueta: 'Sin definir' },
                  ...opciones.razas.map((r) => ({ valor: r.id, etiqueta: (r['nombre'] as string) ?? r.id })),
                ],
              },
            ]}
            alCambiar={recargar}
            alCerrar={() => alEditar(null)}
          />

          {llevaNombres && (
            <AnimalesDeLaTanda
              tandaId={tanda.id}
              especieId={(tanda.especieId ?? '') as string}
              animales={suyos}
              opciones={opciones}
              alCambiar={recargar}
            />
          )}
        </div>
      )}
    </>
  )
}

function AnimalesDeLaTanda({
  tandaId,
  especieId,
  animales,
  opciones,
  alCambiar,
}: {
  tandaId: string
  especieId: string
  animales: AnimalApi[]
  opciones: Comun['opciones']
  alCambiar: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [sexo, setSexo] = useState('hembra')
  const [razaId, setRazaId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const agregar = (e: React.FormEvent) => {
    e.preventDefault()
    api
      .crear('animal', { nombre, sexo, tandaId, especieId, razaId, fechaNacimiento: hoy(), estado: 'activo' })
      .then(() => {
        setNombre('')
        setError(null)
        alCambiar()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'no se pudo crear'))
  }

  return (
    <div className="editor" style={{ marginTop: '-0.4rem' }}>
      <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', textTransform: 'uppercase', color: '#666' }}>
        Animales con nombre
      </h3>

      {animales.length === 0 ? (
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.88rem', color: '#666' }}>Todavía no hay ninguno.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th className="numero">Partos</th>
              <th className="numero">Crías</th>
              <th className="numero">Prom.</th>
            </tr>
          </thead>
          <tbody>
            {animales.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.nombre}
                  <div style={{ fontSize: '0.76rem', color: '#666' }}>
                    {[a.sexo, a.ultimoParto !== null ? `último parto ${a.ultimoParto}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </td>
                <td className="numero">{a.partos}</td>
                <td className="numero">{entero(a.nacidos)}</td>
                <td className="numero">{a.promedioPorParto ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={agregar} style={{ marginTop: '0.7rem' }}>
        <div className="fila">
          <Campo etiqueta="Nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Negra" />
          </Campo>
          <Campo etiqueta="Sexo">
            <select value={sexo} onChange={(e) => setSexo(e.target.value)}>
              <option value="hembra">Hembra</option>
              <option value="macho">Macho</option>
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Raza (opcional)">
          <Selector valor={razaId} alCambiar={setRazaId} opciones={opciones.razas} />
        </Campo>

        {error !== null && <div className="aviso error">{error}</div>}

        <button type="submit" className="fantasma" disabled={nombre === ''}>
          Agregar animal
        </button>
      </form>
    </div>
  )
}

/** Los movimientos detrás de un número (§6.6). */
function Detalle({
  ids,
  alCerrar,
  nombre,
}: {
  ids: string[]
  alCerrar: () => void
  nombre: (id: string) => string
}) {
  const { datos, error } = useDatos(() => api.movimientos(), [])
  const movimientos = (datos ?? []).filter((m: MovimientoApi) => ids.includes(m.id))

  return (
    <section className="tarjeta" style={{ borderColor: '#1b5e20' }}>
      <h2>De dónde sale ese número</h2>
      {error !== null && <Aviso clase="error">{error}</Aviso>}

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Qué</th>
            <th className="numero">Cant.</th>
            <th className="numero">Importe</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td>{m.fecha}</td>
              <td>
                {m.tipo.replace(/_/g, ' ')}
                {m.refId !== undefined && <div style={{ fontSize: '0.78rem', color: '#666' }}>{nombre(m.refId)}</div>}
              </td>
              <td className="numero">{entero(m.cantidad)}</td>
              <td className="numero">{m.importe === undefined ? '—' : pesos(m.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" className="fantasma" onClick={alCerrar} style={{ marginTop: '1rem' }}>
        Cerrar
      </button>
    </section>
  )
}

/** En qué momento está la incubación, contado desde la carga. */
function rotuloEtapa(e: { dia: number; etapa: string; faltan: number }): string {
  if (e.etapa === 'incubando') return `día ${e.dia} · faltan ${e.faltan} para ovoscopía`
  if (e.etapa === 'ovoscopia') return `día ${e.dia} · toca ovoscopía`
  if (e.etapa === 'nacedora') return e.faltan > 0 ? `en nacedora · faltan ${e.faltan}` : 'en nacedora'
  return `terminada · día ${e.dia}`
}

/**
 * Cómo salió una incubación, etapa por etapa.
 *
 * Separar lo descartado en la ovoscopía de lo que no nació importa: lo primero
 * habla de los reproductores o de cómo se guardaron los huevos, lo segundo de
 * la máquina. Un solo porcentaje mezcla las dos cosas y no deja arreglar
 * ninguna.
 */
function Incubacion({
  datos,
  nivel,
}: {
  datos: NonNullable<Tanda['incubacion']>
  nivel: number
}) {
  return (
    <div className="incubacion" style={{ marginLeft: `${nivel * 1.1 + 1.6}rem` }}>
      <table>
        <tbody>
          <tr>
            <td>Se cargaron</td>
            <td className="numero">{entero(datos.cargados)}</td>
            <td />
          </tr>
          {BigInt(datos.descartados) > 0n && (
            <tr>
              <td>Descartados en ovoscopía</td>
              <td className="numero">−{entero(datos.descartados)}</td>
              <td className="numero apagado">
                {datos.descartePorcentaje === null ? '' : `${datos.descartePorcentaje}%`}
              </td>
            </tr>
          )}
          <tr>
            <td>Pasaron a nacedora</td>
            <td className="numero">{entero(datos.aNacedora)}</td>
            <td />
          </tr>
          {BigInt(datos.nacidos) > 0n && (
            <>
              <tr>
                <td>No nacieron</td>
                <td className="numero">−{entero(datos.noNacieron)}</td>
                <td />
              </tr>
              <tr className="total">
                <td>Nacieron</td>
                <td className="numero">{entero(datos.nacidos)}</td>
                <td className="numero">
                  {datos.sobreNacedora === null ? '' : `${datos.sobreNacedora}%`}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      {datos.sobreCargados !== null && BigInt(datos.nacidos) > 0n && (
        <p className="calculado" style={{ margin: '.5rem 0 0' }}>
          {datos.sobreCargados}% sobre todo lo que entró
          {datos.sobreNacedora !== null && datos.sobreNacedora !== datos.sobreCargados && (
            <> · {datos.sobreNacedora}% sobre los que llegaron a la nacedora</>
          )}
          {datos.sobreFertiles !== null && <> · {datos.sobreFertiles}% sobre fértiles</>}
        </p>
      )}
    </div>
  )
}
