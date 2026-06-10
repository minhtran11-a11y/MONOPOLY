/**
 * src/ui/react/main.tsx
 *
 * React entry point. The orchestrator wires this up by (a) adding
 * `<div id="react-root"></div>` to index.html and (b) importing this module
 * AFTER the legacy modules in the entry chain, so surface window overrides
 * win over the legacy assignments.
 *
 * No <StrictMode> on purpose: surfaces install window overrides and interact
 * with an imperative engine; StrictMode's double-invoked effects would make
 * that interop needlessly surprising during the migration.
 */

import { createRoot } from 'react-dom/client';
import App from './App.tsx';

const container = document.getElementById('react-root');

if (container) {
    createRoot(container).render(<App />);
} else {
    // Guard, never throw: the legacy DOM UI must keep working even if the
    // mount point has not been wired into index.html yet.
    console.error('[react-ui] Mount point #react-root not found — React UI layer not mounted.');
}
