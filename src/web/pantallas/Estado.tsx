/**
 * Estado de la granja, y donde se administra lo que se ve.
 *
 * Se recorre como se recorre el campo: primero el lugar, después lo que hay
 * adentro. Cada nivel muestra lo suyo más todo lo que contiene, y el resultado
 * —lo que entró menos lo que salió— para ver qué rinde y qué no.
 *
 * No hay pantalla de configuración: tocando un lugar, una tanda o un insumo se
 * lo corrige o se lo borra ahí mismo. Crear ya se hace al cargar, así que lo
 * único que hacía falta era poder corregir.
 *
 * Nada de esto está guardado: sale de recorrer los movimientos en cada consulta.
 */

import { useState } from 'react'

import { api } from '../api.js'
import type { AnimalApi, EstadoApi, Registro, UnidadApi } from '../api.js'
import { Aviso, Campo, EditarRegistro, Selector, useDatos, Vacio } from '../comun.js'
import { entero, hoy, pesos, pesosExactos } from '../dinero.js'

type Tanda = EstadoApi['tandas'][number]

export function Estado() {
  const estado = useDatos(() => api.estado())
  const especies = useDatos(() => api.listar('especie'))
  const razas = useDatos(() => api.listar('raza'))
  const tipos = useDatos(() => api.listar('categoria'))
  const animales = useDatos(() => api.animales())

  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<string | null>(null)

  if (estado.cargando) return <Vacio>Cargando…</Vacio>
  if (estado.error !== null) return <Aviso clase="error">{estado.error}</Aviso>
  if (estado.datos === null) return null

  const datos = estado.datos
  const recargar = () => {
    estado.recargar()
    animales.recargar()
  }

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

  const totalAnimales = activas.reduce((s, t) => s + BigInt(t.animales), 0n)
  const valorDeposito = datos.deposito.reduce((s, d) => s + BigInt(d.centavos), 0n)
  const cerradas = datos.tandas.length - activas.length

  const opciones = {
    unidades: datos.unidades as unknown as Registro[],
    especies: (especies.datos ?? []) as Registro[],
    razas: (razas.datos ?? []) as Registro[],
    tipos: (tipos.datos ?? []) as Registro[],
    animales: animales.datos ?? [],
  }

  const comun = { editando, alEditar: setEditando, recargar, opciones }

  return (
    <>
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

        <div className="resumen-granja">
          <span>
            <strong>{entero(totalAnimales)}</strong> animales en total
          </span>
          {cerradas > 0 && (
            <span className="apagado">
              {cerradas} tanda{cerradas === 1 ? '' : 's'} cerrada{cerradas === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </section>

      {(BigInt(datos.general.egresos) !== 0n || BigInt(datos.general.ingresos) !== 0n) && (
        <section className="tarjeta">
          <h2>Sin asignar a un lugar</h2>
          <p style={{ margin: 0, color: '#666', fontSize: '0.88rem' }}>
            De toda la granja: el contador, la patente, una compra al depósito todavía sin repartir.
          </p>
          <table style={{ marginTop: '0.75rem' }}>
            <tbody>
              <tr>
                <td>Salió</td>
                <td className="numero">{pesos(datos.general.egresos)}</td>
              </tr>
              <tr>
                <td>Entró</td>
                <td className="numero">{pesos(datos.general.ingresos)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section className="tarjeta">
        <h2>Depósito</h2>

        {datos.deposito.length === 0 ? (
          <Vacio>No hay insumos cargados todavía. Se crean al registrar una compra.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th className="numero">Existencia</th>
                <th className="numero">Costo unitario</th>
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
                    <tr key={`${d.id}-editor`}>
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

/** Un lugar y todo lo que cuelga de él: sus lugares hijos y sus tandas. */
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
  const resultado = BigInt(unidad.resultado)
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
          {BigInt(unidad.costoCentavos) !== 0n && (
            <span className={`chip ${resultado < 0n ? 'malo' : resultado > 0n ? 'bueno' : ''}`}>
              {resultado >= 0n ? '+' : ''}
              {pesos(resultado)}
            </span>
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
  const resultado = BigInt(tanda.resultado)
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
            {tanda.incubacion !== null &&
              tanda.incubacion.sobreCargados !== null &&
              ` · ${entero(tanda.nacidos)} de ${entero(tanda.huevosCargados)} · ${tanda.incubacion.sobreCargados.toFixed(2)}%`}
          </span>
        </button>

        <span className="datos-nodo">
          {BigInt(tanda.animales) !== 0n && <span className="chip">{entero(tanda.animales)}</span>}
          {BigInt(tanda.costoCentavos) !== 0n && (
            <span className={`chip ${resultado < 0n ? 'malo' : resultado > 0n ? 'bueno' : ''}`}>
              {resultado >= 0n ? '+' : ''}
              {pesos(resultado)}
            </span>
          )}
        </span>
      </div>

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
                clave: 'especieId',
                etiqueta: 'Especie',
                tipo: 'opciones',
                opciones: [
                  { valor: '', etiqueta: 'Sin definir' },
                  ...opciones.especies.map((e) => ({ valor: e.id, etiqueta: (e['nombre'] as string) ?? e.id })),
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
              { clave: 'fechaInicio', etiqueta: 'Empezó el' },
            ]}
            alCambiar={recargar}
            alCerrar={() => alEditar(null)}
          />

          {/* Los animales con nombre viven acá, dentro de su tanda: es donde uno
              los busca, no en una pantalla aparte. */}
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

/**
 * Los animales con nombre de una tanda, con lo que rindió cada uno.
 *
 * Sólo aparece en tandas cuyo tipo lleva animales con nombre: seis conejas
 * madre se siguen de a una, novecientos parrilleros no.
 */
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
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.88rem', color: '#666' }}>
          Todavía no hay ninguno cargado.
        </p>
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
