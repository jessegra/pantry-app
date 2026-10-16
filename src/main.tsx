import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './app/App';
import { repo } from './data/repo';
import { watchForUpdates } from './app/updates';

void repo.pruneActivity();
void repo.mergeDuplicates(); // repairs duplicates from older builds; no-op otherwise
watchForUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
