import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@operator-ui/framework/tokens.css';
import '@operator-ui/framework/styles.css';
import { App } from './App';
import './styles.css';

document.documentElement.dataset.theme = 'dark';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
