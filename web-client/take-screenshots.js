import { chromium } from 'playwright';
import fs from 'fs';

const imageDir = 'public/images';
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  // Set deviceScaleFactor to 0.75 to scale down the output resolution to 75%
  // while maintaining the 1400x900 viewport layout
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 0.75 });
  const page = await context.newPage();

  console.log('Taking screenshot of ValueStream...');
  await page.goto('http://localhost:5173/ValueStream/main', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Give React Flow time to render and layout
  await page.screenshot({ path: `${imageDir}/ValueStream.png` });

  console.log('Taking screenshot of Customer List...');
  await page.goto('http://localhost:5173/customers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/customers-list.png` });

  console.log('Taking screenshot of Customer Detail (c1)...');
  await page.goto('http://localhost:5173/customer/c1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/customer-detail.png` });

  console.log('Taking screenshot of Work Item Detail (f1)...');
  await page.goto('http://localhost:5173/workitem/f1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/workitem-detail.png` });

  await browser.close();
  console.log('All screenshots taken successfully at 75% scale!');
})();





