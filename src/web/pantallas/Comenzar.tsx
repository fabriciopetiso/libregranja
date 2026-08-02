/**
 * Primeros pasos.
 *
 * Una granja recién creada está vacía, y una app vacía no se explica sola: la
 * primera pantalla decidía si la persona sigue o abandona. Esto la lleva de la
 * mano por los tres pasos que hacen falta antes de poder cargar algo, en el
 * orden en que dependen entre sí, y desaparece sola cuando ya no hace falta.
 */

import { useState } from 'react'

import { api } from '../api.js'
import type { Registro } from '../api.js'
import { Aviso, Campo, Selector, useDatos } from '../comun.js'
import { hoy } from '../dinero.js'

export function Comenzar({ alTerminar }: { alTerminar: () => void }) {
  const estado = useDatos(() => api.estado())
  const categorias = useDatos(() => api.listar('categoria'))
  const plantillas = useDatos(() => api.listar('plantilla'))

  const [nombreUnidad, setNombreUnidad] = useState('')
  const [nombreTanda, setNombreTanda] = useState('')
  const [plantillaId, setPlantillaId] = useState('')
  const [unidadElegida, setUnidadElegida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const unidades = estado.datos?.unidades ?? []
  const tandas = estado.datos?.tandas ?? []

  const crearUnidad = (e: React.FormEvent) => {
    e.preventDefault()
    setTrabajando(true)
    api
      .crear('unidad', { nombre: nombreUnidad })
      .then((u) => {
        setUnidadElegida((u as Registro).id)
        setNombreUnidad('')
        setError(null)
        estado.recargar()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'no se pudo crear'))
      .finally(() => setTrabajando(false))
  }

  /**
   * Crear la primera tanda arma también su categoría, a partir de la plantilla.
   *
   * Pedirle a alguien que entienda "plantilla → categoría → tanda" antes de
   * poder anotar un pollo es pedirle demasiado. Elige qué se hace ahí adentro y
   * el resto se arma solo; después puede editarlo en Configuración.
   */
  const crearTanda = async (e: React.FormEvent) => {
    e.preventDefault()
    setTrabajando(true)
    setError(null)

    try {
      const plantilla = ((plantillas.datos ?? []) as Registro[]).find((p) => p.id === plantillaId)
      const nombreCategoria = (plantilla?.['nombre'] as string | undefined) ?? 'General'

      const existente = ((categorias.datos ?? []) as Registro[]).find(
        (cat) => cat['plantillaId'] === plantillaId,
      )
      const categoria =
        existente ?? ((await api.crear('categoria', { nombre: nombreCategoria, plantillaId })) as Registro)

      await api.crear('tanda', {
        nombre: nombreTanda,
        categoriaId: categoria.id,
        unidadId: unidadElegida,
        fechaInicio: hoy(),
      })

      setNombreTanda('')
      estado.recargar()
      categorias.recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'no se pudo crear')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <>
      <section className="tarjeta">
        <h2>Primeros pasos</h2>
        <p style={{ marginTop: 0, color: '#666' }}>
          Antes de anotar la primera compra hacen falta dos cosas: un lugar y algo adentro.
        </p>

        <ol className="pasos">
          <li className={unidades.length > 0 ? 'hecho' : 'actual'}>
            <strong>Un lugar</strong> — el gallinero, la conejera, la incubadora
            {unidades.length > 0 && <span> · {unidades.length} creado{unidades.length > 1 ? 's' : ''}</span>}
          </li>
          <li className={tandas.length > 0 ? 'hecho' : unidades.length > 0 ? 'actual' : ''}>
            <strong>Una tanda adentro</strong> — reproductoras, engorde, postura
            {tandas.length > 0 && <span> · {tandas.length} creada{tandas.length > 1 ? 's' : ''}</span>}
          </li>
          <li className={tandas.length > 0 ? 'actual' : ''}>
            <strong>Empezar a cargar</strong> — animales, alimento, ventas
          </li>
        </ol>
      </section>

      <section className="tarjeta">
        <h2>1 · Agregar un lugar</h2>
        <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
          Es dónde están los animales. Adentro de un mismo gallinero puede haber tandas distintas:
          reproductoras por un lado y parrilleros por otro.
        </p>

        {unidades.length > 0 && (
          <table>
            <tbody>
              {unidades.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td className="numero">
                    {u.tandas} tanda{u.tandas === 1 ? '' : 's'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form className="fila" style={{ marginTop: '0.75rem' }} onSubmit={crearUnidad}>
          <input
            value={nombreUnidad}
            onChange={(e) => setNombreUnidad(e.target.value)}
            placeholder="Gallinero 1 / Conejera / Incubadora"
          />
          <button
            type="submit"
            className="principal"
            style={{ flex: '0 0 auto', width: 'auto' }}
            disabled={nombreUnidad === '' || trabajando}
          >
            Agregar
          </button>
        </form>
      </section>

      {unidades.length > 0 && (
        <section className="tarjeta">
          <h2>2 · Qué hay adentro</h2>
          <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
            Una tanda es un grupo de animales con un propósito. Lo que elijas define qué te va a pedir
            la app después: una de postura pide huevos, una de incubación pide huevos cargados.
          </p>

          <form onSubmit={crearTanda}>
            <Campo etiqueta="¿Dónde está?">
              <Selector
                valor={unidadElegida}
                alCambiar={setUnidadElegida}
                opciones={unidades as unknown as Registro[]}
              />
            </Campo>

            <Campo etiqueta="¿Para qué es?">
              <Selector
                valor={plantillaId}
                alCambiar={setPlantillaId}
                opciones={(plantillas.datos ?? []) as Registro[]}
              />
            </Campo>

            <Campo etiqueta="Nombre de la tanda">
              <input
                value={nombreTanda}
                onChange={(e) => setNombreTanda(e.target.value)}
                placeholder="Reproductoras Negra INTA"
              />
            </Campo>

            {error !== null && <Aviso clase="error">{error}</Aviso>}

            <button
              type="submit"
              className="principal"
              disabled={nombreTanda === '' || plantillaId === '' || unidadElegida === '' || trabajando}
            >
              Crear tanda
            </button>
          </form>
        </section>
      )}

      {tandas.length > 0 && (
        <section className="tarjeta">
          <h2>3 · Listo</h2>
          <p style={{ marginTop: 0 }}>
            Ya podés cargar animales, alimento y ventas.
          </p>
          <button type="button" className="principal" onClick={alTerminar}>
            Empezar a cargar
          </button>
        </section>
      )}
    </>
  )
}
