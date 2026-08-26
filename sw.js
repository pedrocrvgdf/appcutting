/* T - Results — service worker */
const CACHE = "tresults-v20";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./icon-180.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Navegação (abrir o app): rede primeiro, cache se offline
  if (e.request.mode === "navigate") {
    /* Só a página do app é guardada como reserva offline. Sem esta conferência,
       navegar para qualquer outro endereço do site (uma página de diagnóstico,
       um 404) gravaria aquele conteúdo sob "./index.html", e o app offline
       passaria a abrir a página errada. */
    const ehOApp = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (ehOApp) { const cp = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Módulos do Firebase (URLs versionadas, imutáveis): cache primeiro
  if (url.hostname === "www.gstatic.com" && url.pathname.includes("firebasejs")) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res;
      }))
    );
    return;
  }

  // Demais arquivos do próprio app: cache primeiro, rede como reserva
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res;
      }).catch(() => hit))
    );
  }
});

/* Aviso de fim de descanso vindo do servidor.
   É o unico caminho que alcanca o usuario dentro de outro app: aqui o codigo
   roda mesmo com a pagina fechada, porque quem acorda o service worker e o
   proprio sistema. */
self.addEventListener("push", e => {
  let d = { titulo: "Descanso concluído", corpo: "Hora da próxima série.", tag: "tresults-descanso" };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) { /* payload vazio: usa o padrão */ }
  e.waitUntil(
    self.registration.showNotification(d.titulo, {
      body: d.corpo,
      tag: d.tag,
      renotify: true,
      requireInteraction: true,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      vibrate: [400, 150, 400, 150, 600],
      lang: "pt-BR",
      // botoes so aparecem no Android; o iOS ignora sem quebrar nada
      actions: [
        { action: "abrir", title: "Abrir treino" },
        { action: "dispensar", title: "Dispensar" }
      ],
      data: { url: "./" }
    })
  );
});

// Toque na notificação do descanso: traz o app de volta em vez de abrir outra aba
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dispensar") return;   // silenciar sem abrir o app
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
      for (const c of lista) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
