const ESTAFF_URL = "https://lykosfutsalclub-cmd.github.io/performance-hub/estaff/";

self.addEventListener("push", event => {
  let data = {};
  try {data = event.data ? event.data.json() : {};} catch {}
  event.waitUntil(self.registration.showNotification(data.title || "Oscar a terminé votre mission", {
    body:data.body || "Votre réponse est prête dans le eStaff.",
    icon:"../lykos-app-icon.jpg",
    badge:"../lykos-app-icon.jpg",
    tag:"lykos-estaff-oscar",
    renotify:true,
    data:{url:data.url || ESTAFF_URL},
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data?.url || ESTAFF_URL;
  event.waitUntil(clients.matchAll({type:"window", includeUncontrolled:true}).then(windows => {
    const existing = windows.find(client => client.url.startsWith(ESTAFF_URL));
    return existing ? existing.focus() : clients.openWindow(target);
  }));
});
