const CACHE="hood-boss-ops-v2";
const ASSETS=["/","/styles.css","/app.js","/manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{if(e.request.url.includes("/api/"))return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)))});
