// No cachea datos personales ni API. La operación de pedidos exige conexión.
const CACHE='los-santos-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/icon.svg','/manifest.webmanifest'])));self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==location.origin||!['/icon.svg','/manifest.webmanifest'].includes(url.pathname))return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))});
