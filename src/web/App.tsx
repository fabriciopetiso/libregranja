import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import { api, pendientes, vaciarCola } from './api.js'
import type { GranjaApi, Sesion } from './api.js'
import { Ingreso } from './pantallas/Ingreso.js'
import { Cargar } from './pantallas/Cargar.js'
import { Comenzar } from './pantallas/Comenzar.js'
import { Config } from './pantallas/Config.js'
import { Estado } from './pantallas/Estado.js'
import { Numeros } from './pantallas/Numeros.js'

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [granjas, setGranjas] = useState<GranjaApi[]>([])
  const [listo, setListo] = useState(false)
  const [enCola, setEnCola] = useState(pendientes())

  const cargarSesion = useCallback(() => {
    return api
      .yo()
      .then((r) => {
        setSesion(r.usuario)
        setGranjas(r.granjas)
      })
      .catch(() => setSesion(null))
  }, [])

  useEffect(() => {
    void cargarSesion().finally(() => setListo(true))
  }, [cargarSesion])

  // La cola se vacía al volver la conexión y cada tanto mientras la app está abierta.
  useEffect(() => {
    if (sesion === null) return undefined

    const intentar = () => {
      void vaciarCola().then(() => setEnCola(pendientes()))
    }

    intentar()
    window.addEventListener('online', intentar)
    const reloj = window.setInterval(intentar, 30_000)

    return () => {
      window.removeEventListener('online', intentar)
      window.clearInterval(reloj)
    }
  }, [sesion])

  const salir = useCallback(() => {
    void api.salir().finally(() => setSesion(null))
  }, [])

  const alGuardar = useCallback(() => setEnCola(pendientes()), [])

  if (!listo) return null
  if (sesion === null) return <Ingreso alEntrar={() => void cargarSesion()} />

  const granjaActual = granjas.find((g) => g.id === sesion.granjaId)

  return (
    <div className="app">
      <header className="barra">
        <div>
          <h1>{granjaActual?.nombre ?? 'Libregranja'}</h1>
          <span className="quien">
            {sesion.nombre} · {sesion.rol}
          </span>
        </div>
        <button
          type="button"
          className="chico fantasma"
          onClick={salir}
          style={{ color: '#fff', borderColor: '#fff' }}
        >
          Salir
        </button>
      </header>

      <nav className="pestanas">
        <Pestana a="/estado">Estado</Pestana>
        <Pestana a="/cargar">Cargar</Pestana>
        <Pestana a="/numeros">Números</Pestana>
        <Pestana a="/config">Configuración</Pestana>
        <Pestana a="/granjas">Granjas</Pestana>
      </nav>

      <main>
        <Routes>
          <Route path="/estado" element={<Estado />} />
          <Route path="/cargar" element={<Cargar alGuardar={alGuardar} />} />
          <Route path="/numeros" element={<Numeros />} />
          <Route path="/config" element={<Config rol={sesion.rol} />} />
          <Route path="/comenzar" element={<PantallaComenzar />} />
          <Route
            path="/granjas"
            element={<Granjas granjas={granjas} activa={sesion.granjaId} alCambiar={cargarSesion} />}
          />
          <Route path="*" element={<Navigate to="/estado" replace />} />
        </Routes>
      </main>

      {enCola > 0 && (
        <div className="pendientes">
          {enCola} {enCola === 1 ? 'carga pendiente' : 'cargas pendientes'} de enviar. Se reintenta sola.
        </div>
      )}
    </div>
  )
}

function PantallaComenzar() {
  const navegar = useNavigate()
  return <Comenzar alTerminar={() => navegar('/cargar')} />
}

/**
 * Granjas del usuario.
 *
 * Cada una tiene sus datos completamente separados: cambiar de granja cambia
 * todo lo que se ve. Sirve para llevar dos establecimientos, o el propio y el
 * de un vecino, sin mezclar un solo número.
 */
function Granjas({
  granjas,
  activa,
  alCambiar,
}: {
  granjas: GranjaApi[]
  activa: string
  alCambiar: () => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navegar = useNavigate()

  const crear = (e: React.FormEvent) => {
    e.preventDefault()
    setTrabajando(true)
    api
      .crearGranja(nombre)
      .then((g) => api.cambiarGranja(g.id))
      .then(() => alCambiar())
      .then(() => {
        setNombre('')
        setError(null)
        navegar('/comenzar')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'no se pudo crear'))
      .finally(() => setTrabajando(false))
  }

  const cambiar = (id: string) => {
    setTrabajando(true)
    api
      .cambiarGranja(id)
      .then(() => alCambiar())
      .then(() => navegar('/estado'))
      .finally(() => setTrabajando(false))
  }

  return (
    <>
      <section className="tarjeta">
        <h2>Mis granjas</h2>
        <table>
          <tbody>
            {granjas.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.nombre}
                  {g.id === activa && (
                    <div style={{ fontSize: '0.78rem', color: '#1b5e20' }}>estás viendo esta</div>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {g.id !== activa && (
                    <button
                      type="button"
                      className="chico fantasma"
                      onClick={() => cambiar(g.id)}
                      disabled={trabajando}
                    >
                      Cambiar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tarjeta">
        <h2>Agregar una granja</h2>
        <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
          Arranca vacía, con sus propias especies, plantillas y rubros. Nada se mezcla con las otras.
        </p>

        <form className="fila" onSubmit={crear}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la granja" />
          <button
            type="submit"
            className="principal"
            style={{ flex: '0 0 auto', width: 'auto' }}
            disabled={nombre === '' || trabajando}
          >
            Crear
          </button>
        </form>

        {error !== null && <div className="aviso error">{error}</div>}
      </section>
    </>
  )
}

function Pestana({ a, children }: { a: string; children: React.ReactNode }) {
  return (
    <NavLink to={a} className={({ isActive }) => (isActive ? 'activa' : '')}>
      {children}
    </NavLink>
  )
}
