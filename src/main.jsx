import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';

// Mises à jour de l'app : dès qu'une nouvelle version est publiée, le service worker
// l'installe et la page se recharge sur la nouvelle version (sinon l'iPhone garde
// l'ancienne version en cache). On vérifie à l'ouverture, à chaque retour dans l'app
// et toutes les heures. Les appels /api/* ne sont jamais mis en cache.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => { if (navigator.onLine !== false) registration.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 60 * 60 * 1000);
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
