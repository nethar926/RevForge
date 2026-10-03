import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import './index.css';
import { runPackPrefMigrations } from './packs/migrations';
import { applyPackDeepLink } from './packs/deepLink';

// Legacy theme/engine ids → canonical pack ids before any hook reads prefs.
runPackPrefMigrations();
// `?pack=<id|slug>` / VITE_PREVIEW_PACK preview builds open straight into a pack.
applyPackDeepLink();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
