const staticCacheName = 'currency-converter-v1';

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(staticCacheName).then(cache => {
			return cache.addAll([
				'/',
				'js/jquery.min.js',
				'js/idb.js',
				'js/materialize.min.js',
				'js/currency-converter.js',
				'https://fonts.googleapis.com/icon?family=Material+Icons',
				'css/materialize.min.css',
				'css/currency-converter.css',
				'images/cactus.png'
			]);
		})
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(cacheNames => Promise.all(
			cacheNames.filter(cacheName => cacheName !== staticCacheName).map(cacheName => caches.delete(cacheName))
			)
		)
	);
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
	const requestUrl = new URL(event.request.url);
	if (requestUrl.pathname.startsWith('/api/v5/convert')) {
		event.respondWith(serveRate(event.request));
		return;
	}

	event.respondWith(
		caches.match(event.request).then(response => {
			return response || fetch(event.request);
		})
	);
});

function serveRate(request) {
	const storageUrl = request.url;

	return caches.open(staticCacheName).then(cache => {
		return cache.match(storageUrl).then(response => {
			if (response) {
				fetch(request).then(cacheResponse => {
					cache.put(storageUrl, cacheResponse);
				});

				return response;
			}

			return fetch(request).then(networkResponse => {
				cache.put(storageUrl, networkResponse.clone());
				return networkResponse;
			});
		});
	});
}

self.addEventListener('message', event => {
	if (event.data.action === 'skipWaiting') {
		self.skipWaiting();
	}
});
