/*
 * Service worker mínimo, escrito a mano.
 *
 * Estrategia: la red primero, el caché como respaldo. Al revés —caché primero—
 * es más rápido pero sirve versiones viejas de la app después de un deploy, y
 * un dato desactualizado en una app de gestión es peor que medio segundo más.
 *
 * Nunca cachea /api: los números se derivan en el servidor y tienen que ser los
 * de ahora. Lo que resuelve la falta de conexión es la cola de reintento, no el
 * caché.
 */

const CACHE = 'libregranja-v1'
const BASICOS = ['/', '/index.html', '/estilos.css', '/icono.svg', '/manifest.webmanifest']

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(BASICOS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url)

  if (evento.request.method !== 'GET' || url.pathname.startsWith('/api/')) return

  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone()
          void caches.open(CACHE).then((cache) => cache.put(evento.request, copia))
        }
        return respuesta
      })
      .catch(async () => {
        const guardada = await caches.match(evento.request)
        if (guardada !== undefined) return guardada
        // Navegación sin red: devolver el app shell y que la app se arregle sola.
        if (evento.request.mode === 'navigate') {
          const shell = await caches.match('/index.html')
          if (shell !== undefined) return shell
        }
        return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión' })
      }),
  )
})
