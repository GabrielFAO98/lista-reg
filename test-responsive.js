const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8787';
const PAGES = ['index.html', 'presentes.html', 'rsvp.html', 'info.html', 'convite.html'];
const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const OUT = 'c:/Users/Gabriel/lista-reg/screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

(async () => {
  const browser = await chromium.launch();
  const issues = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const pg of PAGES) {
      const url = `${BASE}/${pg}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(800);

      const slug = `${pg.replace('.html','')}-${vp.name}`;
      await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true });

      // Check horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      if (overflow) issues.push(`OVERFLOW: ${pg} @ ${vp.name} (${vp.width}px)`);

      // Check for broken images (naturalWidth === 0)
      const brokenImgs = await page.evaluate(() => {
        return Array.from(document.images)
          .filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:'))
          .map(i => i.src);
      });
      if (brokenImgs.length) issues.push(`BROKEN IMGS: ${pg} @ ${vp.name}: ${brokenImgs.join(', ')}`);

      // Check console errors
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

      // Check nav is visible
      const navVisible = await page.evaluate(() => {
        const nav = document.querySelector('.site-nav');
        return nav ? nav.offsetHeight > 0 : null;
      });
      if (navVisible === false) issues.push(`NAV HIDDEN: ${pg} @ ${vp.name}`);

      // Check hero image loaded
      const heroPic = await page.evaluate(() => {
        const img = document.querySelector('.hero-photo, .intro-img, .finale-img');
        return img ? { complete: img.complete, w: img.naturalWidth } : null;
      });
      if (heroPic && heroPic.complete && heroPic.w === 0)
        issues.push(`HERO BROKEN: ${pg} @ ${vp.name}`);

      console.log(`✓ ${slug}`);
    }
    await page.close();
  }

  await browser.close();

  console.log('\n--- ISSUES ---');
  if (issues.length === 0) console.log('None found.');
  else issues.forEach(i => console.log('⚠', i));

  console.log(`\nScreenshots saved to ${OUT}`);
})();
