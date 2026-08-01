/**
 * Las vistas de §6.2 a §6.5, con un rango de fechas común.
 *
 * Cualquier número de cualquier tabla se puede tocar para llegar a los
 * movimientos que lo componen (§6.6). Un número que no se puede abrir no se usa
 * para decidir, así que cada celda viene con los ids detrás.
 */

import { useState } from 'react'

import { api } from '../api.js'
import type { MovimientoApi, Registro } from '../api.js'
import { Abrible, Aviso, useDatos, Vacio } from '../comun.js'
import { entero, mesEnCurso, pesos, pesosExactos } from '../dinero.js'

export function Numeros() {
  const inicial = mesEnCurso()
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [detalle, setDetalle] = useState<string[] | null>(null)

  const rango = { desde, hasta }
  const alimento = useDatos(() => api.alimento(), [])
  const rubros = useDatos(() => api.rubros(rango), [desde, hasta])
  const ventas = useDatos(() => api.ventas(rango), [desde, hasta])
  const resultado = useDatos(() => api.resultado(rango), [desde, hasta])
  const nombres = useDatos(async () => {
    const [insumos, productos, rubro, contrapartes] = await Promise.all([
      api.listar('insumo'),
      api.listar('producto'),
      api.listar('rubro_gasto'),
      api.listar('contraparte'),
    ])
    const mapa = new Map<string, string>()
    for (const lista of [insumos, productos, rubro, contrapartes]) {
      for (const r of lista as Registro[]) mapa.set(r.id, (r['nombre'] as string) ?? r.id)
    }
    return mapa
  }, [])

  const nombre = (id: string): string => nombres.datos?.get(id) ?? id

  return (
    <>
      <section className="tarjeta">
        <div className="fila">
          <label>
            <span>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>

        {/* Una descarga común, no fetch: así el navegador la maneja como archivo
            y en el celular queda en Descargas, lista para compartir. */}
        <a
          className="descarga"
          href={`/api/v1/export.csv?desde=${desde}&hasta=${hasta}`}
          download
        >
          ⭳ Bajar todas las cargas del período (CSV)
        </a>
        <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.8rem' }}>
          Se abre con LibreOffice o Excel. Incluye cada movimiento con su fecha, tanda, importe y quién lo cargó.
        </p>
      </section>

      {resultado.datos !== null && (
        <section className="tarjeta">
          <h2>Resultado del período</h2>
          <table>
            <tbody>
              <tr>
                <td>Ventas</td>
                <td className="numero">{pesos(resultado.datos.ventas)}</td>
              </tr>
              <tr>
                <td>Gastos</td>
                <td className="numero">{pesos(resultado.datos.gastos)}</td>
              </tr>
              <tr className="total">
                <td>Diferencia</td>
                <td className="numero">{pesos(resultado.datos.diferencia)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section className="tarjeta">
        <h2>Gastos por rubro</h2>
        {rubros.datos === null || rubros.datos.filas.length === 0 ? (
          <Vacio>Sin gastos en el período.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Rubro</th>
                <th className="numero">Subtotal</th>
                <th className="numero">%</th>
              </tr>
            </thead>
            <tbody>
              {rubros.datos.filas.map((f) => (
                <tr key={f.refId}>
                  <td>{nombre(f.refId)}</td>
                  <td className="numero">
                    <Abrible valor={pesos(f.centavos)} ids={f.movimientoIds} alAbrir={setDetalle} />
                  </td>
                  <td className="numero">{f.participacion === null ? '—' : `${f.participacion}%`}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                <td className="numero">{pesos(rubros.datos.total)}</td>
                <td className="numero">100%</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="tarjeta">
        <h2>Alimento por tanda</h2>
        {alimento.datos === null || alimento.datos.length === 0 ? (
          <Vacio>Sin entregas de alimento.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tanda</th>
                <th className="numero">Bolsas</th>
                <th className="numero">Kilos</th>
                <th className="numero">Costo</th>
                <th className="numero">%</th>
              </tr>
            </thead>
            <tbody>
              {alimento.datos.map((f) => (
                <tr key={f.tandaId}>
                  <td>{f.nombre}</td>
                  <td className="numero">{entero(f.bolsas)}</td>
                  <td className="numero">{(Number(f.gramos) / 1000).toLocaleString('es-AR')}</td>
                  <td className="numero">
                    <Abrible valor={pesos(f.centavos)} ids={f.movimientoIds} alAbrir={setDetalle} />
                  </td>
                  <td className="numero">{f.participacion === null ? '—' : `${f.participacion}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="tarjeta">
        <h2>Ventas</h2>
        {ventas.datos === null || ventas.datos.filas.length === 0 ? (
          <Vacio>Sin ventas en el período.</Vacio>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="numero">Cantidad</th>
                  <th className="numero">Importe</th>
                  <th className="numero">Precio prom.</th>
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
                    <td className="numero">{pesosExactos(f.precioPromedio)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total</td>
                  <td />
                  <td className="numero">{pesos(ventas.datos.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>

            {ventas.datos.deuda.filas.length > 0 && (
              <>
                <h2 style={{ marginTop: '1.5rem' }}>Deuda pendiente</h2>
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

/** El drill-down de §6.6: los movimientos que forman un número. */
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
      <h2>Movimientos detrás de ese número</h2>
      {error !== null && <Aviso clase="error">{error}</Aviso>}

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Qué</th>
            <th className="numero">Cantidad</th>
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
