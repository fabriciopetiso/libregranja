import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import { api, pendientes, vaciarCola } from './api.js'
import type { GranjaApi, Sesion } from './api.js'
import { Campo, useDatos } from './comun.js'
import { Ingreso } from './pantallas/Ingreso.js'
import { Cargar } from './pantallas/Cargar.js'
import { Comenzar } from './pantallas/Comenzar.js'
import { Inicio } from './pantallas/Inicio.js'

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
        <Pestana a="/inicio">Inicio</Pestana>
        <Pestana a="/cargar">Cargar</Pestana>
        <Pestana a="/granjas">Granjas</Pestana>
      </nav>

      <main>
        <Routes>
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/cargar" element={<Cargar alGuardar={alGuardar} />} />
          <Route path="/comenzar" element={<PantallaComenzar />} />
          <Route
            path="/granjas"
            element={
              <Granjas
                granjas={granjas}
                activa={sesion.granjaId}
                alCambiar={cargarSesion}
                rol={sesion.rol}
              />
            }
          />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
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
  rol,
}: {
  granjas: GranjaApi[]
  activa: string
  alCambiar: () => Promise<void>
  rol: 'admin' | 'operador'
}) {
  const [nombre, setNombre] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
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
      .then(() => navegar('/inicio'))
      .finally(() => setTrabajando(false))
  }

  const borrar = (id: string) => {
    setTrabajando(true)
    setError(null)
    api
      .borrarGranja(id)
      .then(() => alCambiar())
      .then(() => setBorrando(null))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'no se pudo borrar'))
      .finally(() => setTrabajando(false))
  }

  return (
    <>
      <section className="tarjeta">
        <h2>Mis granjas</h2>
        <table>
          <tbody>
            {granjas.map((g) => (
              <>
                <tr key={g.id}>
                  <td>
                    {g.nombre}
                    {g.id === activa && (
                      <div style={{ fontSize: '0.78rem', color: '#1b5e20' }}>estás viendo esta</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {g.id !== activa && (
                      <button
                        type="button"
                        className="chico fantasma"
                        onClick={() => cambiar(g.id)}
                        disabled={trabajando}
                      >
                        Ver esta
                      </button>
                    )}
                    {g.rol === 'admin' && (
                      <button
                        type="button"
                        className="chico fantasma peligro"
                        onClick={() => setBorrando(g.id)}
                        disabled={trabajando}
                        style={{ marginLeft: '0.4rem' }}
                      >
                        Borrar
                      </button>
                    )}
                  </td>
                </tr>
                {borrando === g.id && (
                  <tr key={`${g.id}-c`}>
                    <td colSpan={2}>
                      <div className="aviso">
                        <p style={{ margin: '0 0 0.6rem' }}>
                          Se borra <strong>{g.nombre}</strong> con todo lo cargado adentro. Los datos quedan
                          guardados y se pueden recuperar, pero desde la app no vas a verlos más.
                        </p>
                        <div className="fila">
                          <button
                            type="button"
                            className="principal"
                            onClick={() => borrar(g.id)}
                            disabled={trabajando}
                          >
                            Sí, borrar
                          </button>
                          <button type="button" className="fantasma" onClick={() => setBorrando(null)}>
                            No
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {error !== null && <div className="aviso error">{error}</div>}
      </section>

      <section className="tarjeta">
        <h2>Agregar una granja</h2>
        <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
          Arranca vacía, con sus propias especies, tipos y rubros. Nada se mezcla con las otras.
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
      </section>

      <Quienes rol={rol} />
    </>
  )
}

/**
 * Quiénes cargan en esta granja.
 *
 * Los datos son del servidor, no del teléfono: cada persona entra con su
 * usuario desde el suyo y todos ven lo mismo al instante. Por eso alcanza con
 * dar de alta a quien tenga que cargar.
 */
function Quienes({ rol }: { rol: 'admin' | 'operador' }) {
  const usuarios = useDatos(() => api.usuarios())
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [suRol, setSuRol] = useState('operador')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const agregar = (e: React.FormEvent) => {
    e.preventDefault()
    setTrabajando(true)
    setError(null)
    api
      .crearUsuario({ nombre, usuario, clave, rol: suRol })
      .then(() => {
        setNombre('')
        setUsuario('')
        setClave('')
        usuarios.recargar()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'no se pudo crear'))
      .finally(() => setTrabajando(false))
  }

  return (
    <section className="tarjeta">
      <h2>Quiénes cargan</h2>
      <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
        Cada uno entra con su usuario desde su propio teléfono y todos ven lo mismo: los datos están en el
        servidor, no en el aparato.
      </p>

      <table>
        <tbody>
          {(usuarios.datos ?? []).map((u) => (
            <tr key={u.id}>
              <td>
                {u.nombre}
                <div style={{ fontSize: '0.78rem', color: '#666' }}>
                  {u.usuario} · {u.rol}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rol === 'admin' && (
        <form onSubmit={agregar} style={{ marginTop: '0.75rem' }}>
          <div className="fila">
            <Campo etiqueta="Nombre">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Javier" />
            </Campo>
            <Campo etiqueta="Usuario">
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoCapitalize="none"
                placeholder="javier"
              />
            </Campo>
          </div>
          <div className="fila">
            <Campo etiqueta="Clave">
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="al menos 8 caracteres"
              />
            </Campo>
            <Campo etiqueta="Puede">
              <select value={suRol} onChange={(e) => setSuRol(e.target.value)}>
                <option value="operador">Cargar y ver</option>
                <option value="admin">Todo, incluso borrar</option>
              </select>
            </Campo>
          </div>

          {error !== null && <div className="aviso error">{error}</div>}

          <button
            type="submit"
            className="fantasma"
            disabled={nombre === '' || usuario === '' || clave.length < 8 || trabajando}
          >
            Agregar persona
          </button>
        </form>
      )}
    </section>
  )
}

function Pestana({ a, children }: { a: string; children: React.ReactNode }) {
  return (
    <NavLink to={a} className={({ isActive }) => (isActive ? 'activa' : '')}>
      {children}
    </NavLink>
  )
}
