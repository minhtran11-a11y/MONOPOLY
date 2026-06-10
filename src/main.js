// ESM entry point — Monopoly 3D modernization.
// Modules here execute BEFORE the remaining classic <script defer> tags
// (both share the in-order, after-parse execution list; this tag comes first).
// Import order mirrors the original <script defer> order exactly.

import './services/perf.js';
import './services/settings.js';
import './services/audio.js';
import './services/toast.js';
import './core/constants.js';
import './core/utils.js';
import './core/data.js';
