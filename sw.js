// cache do app ROTINA: abre sem internet; a página nova entra quando houver rede
const C="rotina-v1-1faba10d",BASE=["./","index.html","nuvem_shim.js","manifest.webmanifest","icone-192.png","icone-512.png","https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(BASE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.hostname.endsWith("supabase.co"))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok&&(u.origin===location.origin||u.href==="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js")){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r})
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("index.html"))))});
