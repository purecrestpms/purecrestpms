import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { CmsProvider } from './context/CmsContext.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onOfflineReady() {
        // Offline cache ready
      },
    });
  } catch {
    // Ignore service worker registration failures in restricted contexts
  }
}

createRoot(document.getElementById('root')!).render(
  <CmsProvider>
    <App />
  </CmsProvider>
);
