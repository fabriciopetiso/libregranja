import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'

import { api, pendientes, vaciarCola } from './api.js'
import type { Sesion } from './api.js'
import { Ingreso } from './pantallas/Ingreso.js'
import { Cargar } from './pantallas/Cargar.js'
import { Config } from './pantallas/Config.js'
import { Estado } from './pantallas/Estado.js'
import { Numeros } from './pantallas/Numeros.js'

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [listo, setListo] = useState(false)
  const [enCola, setEnCola] = useState(pendientes())

  // Al arrancar, ver si la cookie sigue viva.
  useEffect(() => {
    api
      .yo()
      .then((r) => setSesion(r.usuario))
      .catch(() => setSesion(null))
      .finally(() => setListo(true))
  }, [])

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

  if (sesion === null) return <Ingreso alEntrar={setSesion} />

  return (
    <div className="app">
      <header className="barra">
        <h1>Libregranja</h1>
        <span className="quien">
          {sesion.nombre} · {sesion.rol}
        </span>
        <button type="button" className="chico fantasma" onClick={salir} style={{ color: '#fff', borderColor: '#fff' }}>
          Salir
        </button>
      </header>

      <nav className="pestanas">
        <Pestana a="/estado">Estado</Pestana>
        <Pestana a="/cargar">Cargar</Pestana>
        <Pestana a="/numeros">Números</Pestana>
        <Pestana a="/config">Configuración</Pestana>
      </nav>

      <main>
        <Routes>
          <Route path="/estado" element={<Estado />} />
          <Route path="/cargar" element={<Cargar alGuardar={alGuardar} />} />
          <Route path="/numeros" element={<Numeros />} />
          <Route path="/config" element={<Config rol={sesion.rol} />} />
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

function Pestana({ a, children }: { a: string; children: React.ReactNode }) {
  return (
    <NavLink to={a} className={({ isActive }) => (isActive ? 'activa' : '')}>
      {children}
    </NavLink>
  )
}
