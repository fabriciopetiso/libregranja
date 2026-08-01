import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './App.js'

const raiz = document.getElementById('app')
if (raiz === null) throw new Error('falta #app')

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// La PWA se instala desde el navegador del celular, sin tiendas (§9).
//
// `serviceWorker` no existe fuera de un contexto seguro, así que entrando por
// http://192.168.x.x esto no corre. La app funciona igual: el service worker
// sólo cachea el app shell. Instalarla en la pantalla de inicio sí necesita HTTPS.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app anda igual; no vale molestar al usuario.
    })
  })
}
