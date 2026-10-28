import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// M0 placeholder. The real shell (navigation, SSE client, record views) lands
// in M4 — see docs/08-web-ui.md. This file exists to prove the single-file
// build pipeline produces a self-contained dist/client/index.html.
function App() {
  return (
    <main
      style={{
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        margin: 0,
        color: '#111',
        background: '#fafafa',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '36rem', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', margin: '0 0 0.5rem' }}>ob</h1>
        <p style={{ margin: '0 0 1.5rem', color: '#555' }}>
          Local-first CRM. Markdown and Git are the database.
        </p>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#777' }}>
          UI shell only — milestone M0. Workspace views arrive in M4.
        </p>
      </div>
    </main>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
