/**
 * Animales con nombre.
 *
 * Sólo tiene sentido donde se los sigue de a uno: seis conejas madre, no
 * novecientos pollos de engorde. Por eso esta pantalla existe aparte y sólo se
 * ofrece para las tandas cuya categoría tiene activada esa capacidad.
 *
 * Lo que se ve acá no está guardado en ningún lado: cuántas crías lleva cada
 * madre sale de contar sus movimientos de nacimiento.
 */

import { useState } from 'react'

import { api } from '../api.js'
import type { AnimalApi, Registro } from '../api.js'
import { Aviso, Campo, Selector, useDatos, Vacio } from '../comun.js'
import { entero, hoy } from '../dinero.js'

export function Animales() {
  const animales = useDatos(() => api.animales())
  const estado = useDatos(() => api.estado())
  const especies = useDatos(() => api.listar('especie'))

  const [nombre, setNombre] = useState('')
  const [sexo, setSexo] = useState('hembra')
  const [tandaId, setTandaId] = useState('')
  const [especieId, setEspecieId] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [error, setError] = useState<string | null>(null)

  // Sólo las tandas cuya categoría lleva animales con nombre. El código no mira
  // cómo se llama la categoría, sólo la capacidad.
  const tandasConNombre = (estado.datos?.tandas ?? []).filter(
    (t) => t.categoria?.['animalesConNombre'] === true,
  )

  const crear = (e: React.FormEvent) => {
    e.preventDefault()
    api
      .crear('animal', { nombre, sexo, tandaId, especieId, fechaNacimiento: fecha, estado: 'activo' })
      .then(() => {
        setNombre('')
        setError(null)
        animales.recargar()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'no se pudo crear'))
  }

  const lista = (animales.datos ?? []) as AnimalApi[]
  const madres = lista.filter((a) => a.partos > 0)

  return (
    <>
      <section className="tarjeta">
        <h2>Animales con nombre</h2>

        {lista.length === 0 ? (
          <Vacio>Todavía no hay ninguno. Cargá los reproductores acá abajo.</Vacio>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tanda</th>
                <th className="numero">Partos</th>
                <th className="numero">Crías</th>
                <th className="numero">Prom.</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.nombre}
                    <div style={{ fontSize: '0.78rem', color: '#666' }}>
                      {[a.sexo, a.especie].filter(Boolean).join(' · ')}
                      {a.ultimoParto !== null && ` · último parto ${a.ultimoParto}`}
                    </div>
                  </td>
                  <td>{a.tanda ?? '—'}</td>
                  <td className="numero">{a.partos}</td>
                  <td className="numero">{entero(a.nacidos)}</td>
                  <td className="numero">{a.promedioPorParto ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {madres.length > 1 && (
          <p style={{ marginTop: '0.75rem', color: '#666', fontSize: '0.82rem' }}>
            El promedio es crías sobre partos registrados. Sirve para comparar entre madres, no como
            número absoluto: una que parió una vez todavía no dice nada.
          </p>
        )}
      </section>

      <section className="tarjeta">
        <h2>Agregar un animal</h2>

        {tandasConNombre.length === 0 && (
          <Aviso>
            Ninguna tanda lleva animales con nombre. Se activa en la plantilla de la categoría, con la
            capacidad <strong>animales con nombre</strong>.
          </Aviso>
        )}

        <form onSubmit={crear}>
          <Campo etiqueta="Nombre o identificación">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Coneja 3 / Negra" />
          </Campo>

          <div className="fila">
            <Campo etiqueta="Sexo">
              <select value={sexo} onChange={(e) => setSexo(e.target.value)}>
                <option value="hembra">Hembra</option>
                <option value="macho">Macho</option>
              </select>
            </Campo>
            <Campo etiqueta="Especie">
              <Selector valor={especieId} alCambiar={setEspecieId} opciones={(especies.datos ?? []) as Registro[]} />
            </Campo>
          </div>

          <div className="fila">
            <Campo etiqueta="Tanda">
              <Selector
                valor={tandaId}
                alCambiar={setTandaId}
                opciones={tandasConNombre as unknown as Registro[]}
              />
            </Campo>
            <Campo etiqueta="Nacimiento o ingreso">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
          </div>

          {error !== null && <Aviso clase="error">{error}</Aviso>}

          <button type="submit" className="principal" disabled={nombre === '' || tandaId === ''}>
            Agregar
          </button>
        </form>
      </section>
    </>
  )
}
