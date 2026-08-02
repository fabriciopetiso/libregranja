import { useState } from 'react'

import { api } from '../api.js'
import { Campo } from '../comun.js'

export function Ingreso({ alEntrar }: { alEntrar: () => void }) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    setEntrando(true)
    setError(null)

    api
      .entrar(usuario, clave)
      .then(() => alEntrar())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'no se pudo entrar'))
      .finally(() => setEntrando(false))
  }

  return (
    <div className="ingreso">
      <h1>Libregranja</h1>
      <p className="lema">Lo que entra, lo que sale, y los números.</p>

      <form onSubmit={enviar}>
        <Campo etiqueta="Usuario">
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </Campo>

        <Campo etiqueta="Clave">
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Campo>

        {error !== null && <div className="aviso error">{error}</div>}

        <button type="submit" className="principal" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
