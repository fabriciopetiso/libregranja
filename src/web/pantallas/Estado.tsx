/**
 * Estado de la granja, como árbol de lugares.
 *
 * Se recorre como se recorre el campo: primero el gallinero, después lo que hay
 * adentro. Cada nivel muestra lo suyo más todo lo que contiene, y el resultado
 * —lo que entró menos lo que salió— para poder ver qué rinde y qué no.
 *
 * Nada de esto está guardado: sale de recorrer los movimientos en cada consulta.
 */

import { useState } from 'react'

import { api } from '../api.js'
import type { EstadoApi, UnidadApi } from '../api.js'
import { Aviso, useDatos, Vacio } from '../comun.js'
import { entero, pesos, pesosExactos } from '../dinero.js'

type Tanda = EstadoApi['tandas'][number]

export function Estado() {
  const { datos, error, cargando } = useDatos(() => api.estado())
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  if (cargando) return <Vacio>Cargando…</Vacio>
  if (error !== null) return <Aviso clase="error">{error}</Aviso>
  if (datos === null) return null

  const alternar = (id: string) =>
    setAbiertos((previos) => {
      const nuevos = new Set(previos)
      if (nuevos.has(id)) nuevos.delete(id)
      else nuevos.add(id)
      return nuevos
    })

  // Las tandas cerradas —tuvieron animales y ahora tienen cero— salen del
  // listado solas. Sus números siguen enteros en Números.
  const activas = datos.tandas.filter((t) => !t.cerrada)
  const raices = datos.unidades.filter((u) => u.unidadPadreId === null)
  const sinLugar = activas.filter((t) => t.unidadId === null)

  const totalAnimales = activas.reduce((s, t) => s + BigInt(t.animales), 0n)
  const valorDeposito = datos.deposito.reduce((s, d) => s + BigInt(d.centavos), 0n)
  const cerradas = datos.tandas.length - activas.length

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
              />
            ))}

            {sinLugar.length > 0 && (
              <div className="nodo">
                <div className="fila-nodo" style={{ paddingLeft: 0 }}>
                  <span className="nombre-nodo sin-lugar">Sin lugar asignado</span>
                </div>
                {sinLugar.map((t) => (
                  <FilaTanda key={t.id} tanda={t} nivel={1} />
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
            Gastos e ingresos de toda la granja: el contador, la patente, una compra al depósito
            todavía sin repartir.
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
          <Vacio>No hay insumos cargados todavía.</Vacio>
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
                <tr key={d.id}>
                  <td>{d['nombre'] as string}</td>
                  <td className="numero">{entero(d.unidades)}</td>
                  <td className="numero">{pesosExactos(d.costoUnitario)}</td>
                  <td className="numero">{pesos(d.centavos)}</td>
                </tr>
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

/** Un lugar y todo lo que cuelga de él: sus lugares hijos y sus tandas. */
function Rama({
  unidad,
  todas,
  tandas,
  nivel,
  abiertos,
  alAlternar,
}: {
  unidad: UnidadApi
  todas: UnidadApi[]
  tandas: Tanda[]
  nivel: number
  abiertos: Set<string>
  alAlternar: (id: string) => void
}) {
  const hijas = todas.filter((u) => u.unidadPadreId === unidad.id)
  const suyas = tandas.filter((t) => t.unidadId === unidad.id)
  const cerrado = abiertos.has(unidad.id)
  const tieneAlgo = hijas.length > 0 || suyas.length > 0
  const resultado = BigInt(unidad.resultado)

  const especies = Object.entries(unidad.animalesPorEspecie)

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

        <span className="nombre-nodo">{unidad.nombre}</span>

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
            />
          ))}
          {suyas.map((t) => (
            <FilaTanda key={t.id} tanda={t} nivel={nivel + 1} />
          ))}
        </>
      )}
    </div>
  )
}

function FilaTanda({ tanda, nivel }: { tanda: Tanda; nivel: number }) {
  const resultado = BigInt(tanda.resultado)

  return (
    <div className="fila-nodo tanda" style={{ paddingLeft: `${nivel * 1.1 + 1.6}rem` }}>
      <span className="nombre-nodo">
        {tanda['nombre'] as string}
        <span className="detalle-tanda">
          {[tanda.categoria?.['nombre'] as string | undefined, `${tanda.diasAbierta} días`]
            .filter(Boolean)
            .join(' · ')}
          {tanda.incubacion !== null &&
            tanda.incubacion.sobreCargados !== null &&
            ` · ${entero(tanda.nacidos)} de ${entero(tanda.huevosCargados)} · ${tanda.incubacion.sobreCargados.toFixed(2)}%`}
        </span>
      </span>

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
  )
}
