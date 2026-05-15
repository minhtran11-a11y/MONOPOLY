// Lighthouse audit runner — desktop preset.
const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');

(async () => {
    const chrome = await chromeLauncher.launch({
        chromeFlags: ['--headless=new', '--disable-gpu', '--no-sandbox'],
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });

    const opts = {
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        port: chrome.port,
        preset: 'desktop',
        screenEmulation: { disabled: false }
    };

    try {
        const result = await lighthouse('http://127.0.0.1:8770/', opts);
        const cats = result.lhr.categories;
        const audits = result.lhr.audits;
        console.log('=== LIGHTHOUSE DESKTOP AUDIT ===');
        console.log('Performance:    ', Math.round(cats.performance.score * 100));
        console.log('Accessibility:  ', Math.round(cats.accessibility.score * 100));
        console.log('Best Practices: ', Math.round(cats['best-practices'].score * 100));
        console.log('SEO:            ', Math.round(cats.seo.score * 100));
        console.log('');
        console.log('=== CORE METRICS ===');
        console.log('LCP:', audits['largest-contentful-paint'].displayValue);
        console.log('FCP:', audits['first-contentful-paint'].displayValue);
        console.log('CLS:', audits['cumulative-layout-shift'].displayValue);
        console.log('TBT:', audits['total-blocking-time'].displayValue);
        console.log('SI :', audits['speed-index'].displayValue);
        console.log('');
        console.log('=== A11Y FAILURES (if any) ===');
        Object.keys(audits).filter(k => audits[k].score === 0 && cats.accessibility.auditRefs.find(r => r.id === k))
            .forEach(k => console.log(' - ' + k + ': ' + audits[k].title));

        require('fs').writeFileSync('lighthouse-report.json', JSON.stringify(result.lhr, null, 2));
        console.log('\nFull report → lighthouse-report.json');
    } catch (e) {
        console.error('Audit failed:', e.message);
    }
    await chrome.kill();
})();
