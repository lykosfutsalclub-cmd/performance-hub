const ESTAFF_URL = "https://lykosfutsalclub-cmd.github.io/performance-hub/estaff/";

self.addEventListener("push", event => {
  event.waitUntil(self.registration.showNotification("Nouvelle information eStaff", {
    body:"Une mission ou un contrôle demande votre attention.",
    icon:"../lykos-app-icon.jpg",
    badge:"../lykos-app-icon.jpg",
    tag:"lykos-estaff",
    renotify:true,
    data:{url:ESTAFF_URL},
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:"window", includeUncontrolled:true}).then(windows => {
    const existing = windows.find(client => client.url.startsWith(ESTAFF_URL));
    return existing ? existing.focus() : clients.openWindow(ESTAFF_URL);
  }));
});
