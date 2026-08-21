/* Guardian S.O.S - Service Worker
 *
 * Responsibilities:
 *   1. Pre-cache the app shell so it loads instantly and works offline
 *   2. Serve network-first for API calls (always fresh), cache-first for static assets
 *   3. Receive Push events from the server (used by the watcher mode to wake the
 *      victim's app and alert the guardian when a contact triggers S.O.S)
 *   4. Handle notification clicks (focus existing tab or open new one)
 *
 * Version: 1.0.0
 */

const SW_VERSION = 'guardian-sos-v1.0.0'
const APP_SHELL_CACHE = `${SW_VERSION}-shell`
const APP_SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/logo.svg',
]

// ============================================================
// INSTALL - pre-cache the app shell
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] install failed:', err))
  )
})

// ============================================================
// ACTIVATE - clean up old caches
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ============================================================
// FETCH - network-first for navigation/API, cache-first for static
// ============================================================
self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // Skip non-GET (POST/PUT/DELETE) - never cache mutations
  if (req.method !== 'GET') return

  // Navigation requests (HTML pages) - network-first, fall back to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || caches.match('/index.html')))
    )
    return
  }

  // API requests - always network, no cache (data must be fresh)
  if (url.pathname.startsWith('/api/')) {
    return // let the browser handle it normally
  }

  // Static assets - cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res
          const copy = res.clone()
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, copy))
          return res
        })
        .catch(() => cached)
    })
  )
})

// ============================================================
// PUSH - receive server push notifications
// ============================================================
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    try {
      payload = { title: 'Guardian S.O.S', body: event.data ? event.data.text() : '' }
    } catch (_e) {
      payload = { title: 'Guardian S.O.S', body: 'Nueva alerta' }
    }
  }

  const title = payload.title || '🚨 Guardian S.O.S'
  const options = {
    body: payload.body || 'Tienes una nueva alerta',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: payload.tag || 'guardian-sos-alert',
    renotify: true,
    requireInteraction: payload.requireInteraction !== false,
    vibrate: [200, 100, 200, 100, 400],
    data: {
      url: payload.url || '/',
      ...(payload.data || {}),
    },
    actions: payload.actions || [
      { action: 'view', title: 'Ver alerta' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ============================================================
// NOTIFICATION CLICK - focus existing tab or open new one
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Look for a tab already showing the app
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl)
            return client.focus()
          }
        }
        // No existing tab - open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      })
  )
})

// ============================================================
// MESSAGE - allow page to talk to the SW (skip waiting, etc.)
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
