#!/usr/bin/env node
/**
 * scripts/sync-shared.mjs
 *
 * Copies the pure rules core into the Edge Functions shared folder so the
 * server referee bundles EXACTLY the same engine the browser runs:
 *
 *   src/core/rules_core.ts  ->  supabase/functions/_shared/rules_core.ts
 *   src/core/types.ts       ->  supabase/functions/_shared/types.ts
 *   src/core/board.ts       ->  supabase/functions/_shared/board.ts
 *
 * The copies get an AUTO-COPIED header; never edit them by hand.
 * Run before every Edge Function deploy:  node scripts/sync-shared.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER =
    '// AUTO-COPIED from src/core — do not edit. Regenerate with: node scripts/sync-shared.mjs\n';
const FILES = ['rules_core.ts', 'types.ts', 'board.ts'];

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(projectRoot, 'src', 'core');
const destDir = path.join(projectRoot, 'supabase', 'functions', '_shared');

async function main() {
    await mkdir(destDir, { recursive: true });
    for (const file of FILES) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(destDir, file);
        const content = await readFile(srcPath, 'utf8');
        await writeFile(destPath, HEADER + content, 'utf8');
        console.log(
            `[sync-shared] ${path.relative(projectRoot, srcPath)} -> ${path.relative(projectRoot, destPath)}`,
        );
    }
    console.log(`[sync-shared] done (${FILES.length} files).`);
}

main().catch((err) => {
    console.error('[sync-shared] FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
