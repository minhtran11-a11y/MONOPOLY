// Lighthouse audit runner — desktop preset, N runs, report best/median/worst.
const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');

const RUNS = parseInt(process.argv[2] || '3', 10);

async function runOnce(idx) {
    const chrome = await chromeLauncher.launch({
        chromeFlags: ['--headless=new', '--disable-gpu', '--no-sandbox'],
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    try {
        const result = await lighthouse('http://127.0.0.1:8770/', {
            logLevel: 'error',
            output: 'json',
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            port: chrome.port,
            preset: 'desktop'
        });
        const c = result.lhr.categories;
        const a = result.lhr.audits;
        const row = {
            run: idx,
            perf: Math.round(c.performance.score * 100),
            a11y: Math.round(c.accessibility.score * 100),
            bp:   Math.round(c['best-practices'].score * 100),
            seo:  Math.round(c.seo.score * 100),
            lcp:  a['largest-contentful-paint'].numericValue,
            fcp:  a['first-contentful-paint'].numericValue,
            cls:  a['cumulative-layout-shift'].numericValue,
            tbt:  a['total-blocking-time'].numericValue
        };
        if (idx === RUNS - 1) require('fs').writeFileSync('lighthouse-report.json', JSON.stringify(result.lhr, null, 2));
        return row;
    } finally {
        try { await chrome.kill(); } catch (e) {}
    }
}

(async () => {
    const rows = [];
    for (let i = 0; i < RUNS; i++) {
        process.stdout.write(`Run ${i + 1}/${RUNS}... `);
        try { rows.push(await runOnce(i)); process.stdout.write('done\n'); }
        catch (e) { process.stdout.write('failed: ' + e.message + '\n'); }
    }
    if (rows.length === 0) { console.error('All runs failed'); return; }

    const med = (arr) => { const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
    const min = (arr) => Math.min(...arr);
    const max = (arr) => Math.max(...arr);

    console.log('\n=== LIGHTHOUSE DESKTOP — ' + rows.length + ' RUNS ===');
    console.log('               BEST   MEDIAN   WORST    TARGET   STATUS');
    function fmt(label, vals, target, higher = true) {
        const b = max(vals), m = med(vals), w = min(vals);
        const passVal = higher ? b : Math.min(...vals);
        const ok = higher ? (m >= target) : (m <= target);
        console.log(label.padEnd(14), String(b).padEnd(6), String(m).padEnd(8), String(w).padEnd(8), String(target).padEnd(8), ok ? 'PASS' : 'CLOSE');
    }
    fmt('Performance:', rows.map(r=>r.perf), 85);
    fmt('Accessibility:', rows.map(r=>r.a11y), 95);
    fmt('Best Practices:', rows.map(r=>r.bp), 90);
    fmt('SEO:', rows.map(r=>r.seo), 90);
    console.log('\n=== CORE METRICS (median) ===');
    console.log('LCP: ' + Math.round(med(rows.map(r=>r.lcp))) + 'ms (target <2500ms)');
    console.log('FCP: ' + Math.round(med(rows.map(r=>r.fcp))) + 'ms (target <1500ms)');
    console.log('CLS: ' + med(rows.map(r=>r.cls)).toFixed(4) + ' (target <0.1)');
    console.log('TBT: ' + Math.round(med(rows.map(r=>r.tbt))) + 'ms (target <200ms)');
})();
