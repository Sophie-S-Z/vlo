import '@/styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { PreferencesProvider } from '@/app/PreferencesProvider';

const root = document.getElementById('root');
if (!root) throw new Error('Vlo could not find its root element.');

createRoot(root).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
);
