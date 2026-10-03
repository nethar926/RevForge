import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import './index.css';
import { runPackPrefMigrations } from './packs/migrations';

// Legacy theme/engine ids → canonical pack ids before any hook reads prefs.
runPackPrefMigrations();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
