// Service worker minimo: riceve le push del browser e mostra la notifica di sistema,
// anche quando l'app non è aperta in nessuna scheda. Non fa caching/offline: quello
// non è lo scopo qui, solo ricevere ed esporre le notifiche push.

self.addEventListener("push", (event) => {
  let dati = {};
  try {
    dati = event.data ? event.data.json() : {};
  } catch {
    dati = { title: "Planner Turni", body: event.data ? event.data.text() : "" };
  }
  const titolo = dati.title || "Planner Turni";
  const opzioni = {
    body: dati.body || "",
    icon: "/favicon.png",
    badge: "/favicon.png",
    data: { url: dati.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(titolo, opzioni));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((finestre) => {
      for (const finestra of finestre) {
        if (finestra.url.includes(self.location.origin) && "focus" in finestra) return finestra.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
