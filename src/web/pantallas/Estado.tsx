/** Estado actual (§6.1) y estado del depósito (§6.2). */

import { api } from '../api.js'
import { Aviso, useDatos, Vacio } from '../comun.js'
import { entero, pesos, pesosExactos } from '../dinero.js'

export function Estado() {
  const { datos, error, cargando } = useDatos(() => api.estado())

  if (cargando) return <Vacio>Cargando…</Vacio>
  if (error !== null) return <Aviso clase="error">{error}</Aviso>
  if (datos === null) return null

  const activas = datos.tandas.filter((t) => t['fechaCierre'] === null)
  const porCategoria = new Map<string, typeof activas>()

  for (const tanda of activas) {
    const clave = (tanda.categoria?.['nombre'] as string | undefined) ?? 'Sin categoría'
    porCategoria.set(clave, [...(porCategoria.get(clave) ?? []), tanda])
  }

  const totalAnimales = activas.reduce((s, t) => s + BigInt(t.animales), 0n)
  const valorDeposito = datos.deposito.reduce((s, d) => s + BigInt(d.centavos), 0n)

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
        <h2>Tandas activas</h2>

        {activas.length === 0 ? (
          <Vacio>No hay tandas abiertas. Creá una en Configuración.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tanda</th>
                <th className="numero">Animales</th>
                <th className="numero">Días</th>
                <th className="numero">Costo</th>
              </tr>
            </thead>
            {[...porCategoria.entries()].map(([categoria, tandas]) => (
              <tbody key={categoria}>
                <tr>
                  <td colSpan={4} style={{ paddingTop: '0.9rem', color: '#666', fontSize: '0.8rem' }}>
                    {categoria.toUpperCase()}
                  </td>
                </tr>
                {tandas.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t['nombre'] as string}
                      {t.incubacion !== null && t.incubacion.sobreCargados !== null && (
                        <div style={{ fontSize: '0.78rem', color: '#666' }}>
                          {entero(t.nacidos)} de {entero(t.huevosCargados)} huevos ·{' '}
                          {t.incubacion.sobreCargados.toFixed(2)}%
                          {t.incubacion.sobreFertiles !== null &&
                            ` · ${t.incubacion.sobreFertiles.toFixed(2)}% sobre fértiles`}
                        </div>
                      )}
                    </td>
                    <td className="numero">{entero(t.animales)}</td>
                    <td className="numero">{t.diasAbierta}</td>
                    <td className="numero">{pesos(t.costoCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tbody>
              <tr className="total">
                <td>Total de la granja</td>
                <td className="numero">{entero(totalAnimales)}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>

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
