import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const folder = resolve("scripts/demo/assets");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
  for (const category of ["road", "streetlight", "drainage", "signage", "sidewalk", "other"]) {
    for (const kind of ["initial", "resolution"]) {
      const repaired = kind === "resolution";
      const scene: Record<string, string> = {
        road: `<path d="M250 165H550L740 420H60Z" fill="#667580"/><path d="M390 180L350 420M420 180L460 420" stroke="#f5dc8c" stroke-width="5"/>${repaired ? '<path d="M215 315L365 295L420 365L230 380Z" fill="#44505b"/>' : '<ellipse cx="305" cy="342" rx="88" ry="33" fill="#293744" stroke="#9a8770" stroke-width="12"/><path d="M215 340L170 325M350 315L375 289M347 369L390 405" stroke="#273745" stroke-width="5"/>'}`,
        streetlight: `<path d="M380 414V190Q380 140 440 140H492" fill="none" stroke="#415567" stroke-width="16"/><path d="M463 143H525L507 164H476Z" fill="${repaired ? '#ffda6a' : '#5c6872'}"/>${repaired ? '<path d="M478 177L424 360H579L511 177Z" fill="#f8d56a" opacity=".35"/><circle cx="495" cy="157" r="18" fill="#ffe49a"/>' : '<path d="M481 150L499 158L487 164" fill="none" stroke="#b84937" stroke-width="4"/>'}`,
        drainage: `<path d="M120 285H680V389H120Z" fill="#8697a0"/><path d="M157 306H640V360H157Z" fill="#293d49"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${180 + i * 38} 302V365" stroke="#a6b4bb" stroke-width="12"/>`).join('')}${repaired ? '<path d="M200 385Q260 370 310 385T440 385T570 385" stroke="#73b8c5" fill="none" stroke-width="5"/>' : '<ellipse cx="400" cy="385" rx="250" ry="24" fill="#82bfcc" opacity=".7"/><path d="M225 307L280 289L291 325L250 342Z" fill="#bb8856"/><path d="M340 312L393 300L410 346L350 338Z" fill="#d0b36e"/><path d="M475 310L520 300L538 338L488 347Z" fill="#8da25f"/>'}`,
        signage: `<path d="M400 417V222" stroke="#718693" stroke-width="13"/><g transform="rotate(${repaired ? '0' : '18'} 400 240)"><path d="M400 149L490 299H310Z" fill="#f8f0d9" stroke="#bf5944" stroke-width="13"/><path d="M400 194V242" stroke="#344c60" stroke-width="12"/><circle cx="400" cy="266" r="7" fill="#344c60"/>${repaired ? '' : '<path d="M335 262L380 241L419 266L465 239" fill="none" stroke="#8a918a" stroke-width="9"/>'}</g>`,
        sidewalk: `<path d="M225 183H525L655 415H100Z" fill="#b9b4a2" stroke="#899797" stroke-width="3"/><path d="M198 240H558M167 299H589M133 359H623M323 183L285 415M426 183L470 415" fill="none" stroke="#8b9796" stroke-width="3"/>${repaired ? '<path d="M299 301H466L478 358H289Z" fill="#d2ccba"/>' : '<path d="M350 265L336 298L374 315L348 344L362 377" fill="none" stroke="#4d5b5d" stroke-width="10"/><path d="M360 315L416 302L438 325" fill="none" stroke="#4d5b5d" stroke-width="6"/>'}`,
        other: `<path d="M190 305H608M205 260H593" stroke="#637981" stroke-width="15"/><path d="M225 200V407M580 200V407" stroke="#637981" stroke-width="18"/>${repaired ? '<path d="M325 230V325M465 230V325" stroke="#637981" stroke-width="12"/>' : '<path d="M325 230L355 308M465 230L435 308" stroke="#a55b43" stroke-width="12"/>'}`,
      };
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#e9f0ed"/><rect y="165" width="800" height="280" fill="#d3ddd4"/><g fill="#b5c7c4"><path d="M45 170V90H155V170ZM625 170V74H740V170ZM177 170V120H250V170Z"/></g><path d="M0 420H800" stroke="#a5b7b3" stroke-width="3"/>${scene[category]}<rect x="24" y="23" width="212" height="32" rx="5" fill="#224d4b"/><text x="39" y="45" fill="white" font-family="Arial" font-size="16" font-weight="bold">KAMOTI DEMO IMAGE</text><text x="28" y="475" fill="#24444b" font-family="Arial" font-size="21">Makati · ${category} · ${repaired ? 'after repair' : 'reported condition'}</text><text x="775" y="45" text-anchor="end" fill="#415c62" font-family="Arial" font-size="14">Illustration, not a real incident</text></svg>`;
      await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
      await page.screenshot({ path: resolve(folder, `${category}-${kind}.png`) });
    }
  }
  console.log("Rendered 12 labelled demo illustrations.");
} finally {
  await browser.close();
}
