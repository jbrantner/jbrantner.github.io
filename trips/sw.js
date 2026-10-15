// Trip Status moved to /trip-status/. This removes the old offline copy from phones that opened the old address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.delete('trips-v1').then(() => self.registration.unregister())));
