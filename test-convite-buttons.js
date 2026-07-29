const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8787';
const OUT  = 'c:/Users/Gabriel/lista-reg/screenshots/convite-buttons';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-se',      width: 375,  height: 667  },
  { name: 'iphone-14',      width: 390,  height: 844  },
  { name: 'iphone-14-pro',  width: 393,  height: 852  },
  { name: 'android-small',  width: 360,  height: 780  },
  { name: 'tablet-768',     width: 768,  height: 1024 },
];

(async () => {
  const browser = await chromium.launch();
  const issues  = [];

  for (const dev of DEVICES) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: dev.width, height: dev.height });
    await page.goto(`${BASE}/convite.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(600);

    // Click intro to reveal finale
    await page.click('#intro');
    await page.waitForTimeout(500);

    // Screenshot of full finale
    await page.screenshot({ path: `${OUT}/${dev.name}-finale.png` });

    // Check each button is visible and within viewport
    const btns = await page.evaluate((vw) => {
      return Array.from(document.querySelectorAll('.inv-btn')).map(btn => {
        const r = btn.getBoundingClientRect();
        const style = window.getComputedStyle(btn);
        return {
          href: btn.getAttribute('href'),
          display: style.display,
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
          clippedLeft:   r.left < 0,
          clippedRight:  r.right > vw,
        };
      }).filter(b => b.display !== 'none');
    }, dev.width);

    console.log(`\n── ${dev.name} (${dev.width}×${dev.height}) ──`);
    btns.forEach(b => {
      const ok = !b.clippedLeft && !b.clippedRight && b.width > 0;
      const flag = ok ? '✓' : '⚠';
      console.log(`  ${flag} ${b.href}  pos=(${b.left},${b.top})  size=${b.width}×${b.height}${b.clippedLeft ? ' CLIP-LEFT' : ''}${b.clippedRight ? ' CLIP-RIGHT' : ''}`);
      if (!ok) issues.push(`${dev.name}: ${b.href} fora da tela`);
    });
  }

  await browser.close();

  console.log('\n── RESUMO ──');
  if (issues.length === 0) console.log('Nenhum problema encontrado.');
  else issues.forEach(i => console.log('⚠', i));

  console.log(`\nScreenshots em: ${OUT}`);
})();
