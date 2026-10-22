import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './core/AppErrorBoundary';
import './styles.css';
import './livingUniverse.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

// Keep the official Kuro launch artwork visible until React has mounted the app.
// The timeout is bounded so an initialization error can never trap the user on the splash.
const releaseKuroLaunchScreen = () => {
  const screen = document.getElementById('kuro-launch-screen');
  if (!screen || screen.classList.contains('is-leaving')) return;
  screen.classList.add('is-leaving');
  window.setTimeout(() => screen.remove(), 520);
};
const waitForKuroAppMount = (startedAt: number) => {
  const root = document.getElementById('root');
  if (root?.firstElementChild) {
    window.setTimeout(releaseKuroLaunchScreen, 420);
    return;
  }
  if (performance.now() - startedAt >= 10000) {
    releaseKuroLaunchScreen();
    return;
  }
  window.requestAnimationFrame(() => waitForKuroAppMount(startedAt));
};
window.requestAnimationFrame(() => waitForKuroAppMount(performance.now()));
