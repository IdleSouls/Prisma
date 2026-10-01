/* Service worker del portale cliente (task PWA, richiesta Matteo: "l'app come alternativa al
   portale su pc"). Deliberatamente minimale: serve solo a rendere il portale installabile
   ("Aggiungi a schermata Home"/"Installa app") e a far ripartire più in fretta il "guscio" della
   pagina (l'HTML/CSS/JS statico), MAI a mettere in cache i dati del cliente.

   Regola non negoziabile: ogni richiesta verso /api/ (comunicazioni, scadenze, documenti, F24,
   andamento - tutto ciò che questo file gestisce) passa SEMPRE e SOLO dalla rete, mai dalla cache.
   Cachare quei dati vorrebbe dire rischiare di mostrare a un cliente informazioni vecchie o,
   peggio, un fascicolo altrui rimasto in cache da una sessione precedente sullo stesso dispositivo
   condiviso — inaccettabile per dati di questo tipo. Lo stesso vale per qualunque richiesta che non
   sia una GET: non si intercettano mai POST (le scritture del cliente - nuovo messaggio, risposta,
   invio password - devono sempre arrivare al server, mai essere "assorbite" da questo file). */
const CACHE_NOME = 'portale-guscio-v1';

self.addEventListener('install', (evento) => {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE_NOME)
      .then((cache) => cache.addAll(['./']))
      .catch(() => { /* primo avvio senza rete, o browser che nega la cache: non blocca l'installazione */ })
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE_NOME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== 'GET') return; // mai le POST verso /api/portale-*: sempre e solo rete
  let url;
  try { url = new URL(richiesta.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // mai intercettare Google Fonts o altro cross-origin
  if (url.pathname.indexOf('/api/') === 0) return; // mai i dati: sempre rete, nessuna cache

  // Solo il guscio (la pagina/manifest/service worker stessi): rete-prima con ripiego sulla cache
  // solo se davvero offline, così il cliente vede comunque un'app che si apre (anche se poi la
  // richiesta dati fallirà con il messaggio "portale non disponibile" già gestito dalla pagina).
  evento.respondWith(
    fetch(richiesta)
      .then((risposta) => {
        const copia = risposta.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(richiesta, copia)).catch(() => {});
        return risposta;
      })
      .catch(() => caches.match(richiesta))
  );
});

/* Notifiche push (richiesta Matteo: avviso sul cellulare quando lo studio pubblica una nuova
   comunicazione). Il payload arriva già pronto da server.js (vedi inviaPushNuoveComunicazioni):
   {titolo, corpo, url}. Se per qualunque motivo il payload non è JSON valido si mostra comunque
   una notifica generica invece di far fallire silenziosamente l'evento - meglio un avviso vago
   che nessun avviso. */
self.addEventListener('push', (evento) => {
  let dati = { titolo: 'Nuova comunicazione dallo studio', corpo: 'Apri il portale per leggerla.', url: './' };
  if (evento.data) {
    try { dati = Object.assign(dati, evento.data.json()); } catch (e) { /* payload non JSON: restano i valori di default */ }
  }
  evento.waitUntil(
    Promise.all([
      self.registration.showNotification(dati.titolo, {
        body: dati.corpo,
        icon: undefined, // usa l'icona di sistema/del manifest, niente da caricare qui
        data: { url: dati.url || './' },
        tag: 'prisma-portale', // una notifica sostituisce la precedente invece di accumularsi se il cliente non le apre
      }),
      // Task #183 (Matteo: "le notifiche per le nuove comunicazioni nel portale cliente non
      // funzionano bene"): se il portale è già aperto in una scheda, Chrome spesso non mostra
      // nemmeno la notifica di sistema per una pagina in primo piano - senza questo messaggio
      // quella scheda restava ferma fino al prossimo giro di polling. Avvisa ogni scheda aperta
      // (anche quelle non "controllate" da questo service worker, rare ma possibili subito dopo
      // un aggiornamento) così può ricaricare la vista subito, vedi il listener 'message' in
      // portale-cliente.htm > iniziaPolling.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((elenco) => {
        elenco.forEach((client) => client.postMessage({ tipo: 'prisma-nuova-comunicazione' }));
      }),
    ])
  );
});

/* Click sulla notifica: porta alla scheda del portale già aperta se c'è, altrimenti ne apre una
   nuova sull'URL indicato nel payload (il link diretto al cliente, vedi sopra). */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destinazione = (evento.notification.data && evento.notification.data.url) || './';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((elenco) => {
      for (const client of elenco) {
        if (client.url.indexOf(destinazione) !== -1 && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(destinazione);
    })
  );
});
