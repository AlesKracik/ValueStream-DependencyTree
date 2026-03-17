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

  const baseUrl = 'http://localhost:5173';
  const adminSecret = 'just_do_it';

  console.log('Authenticating...');
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.evaluate((secret) => {
    sessionStorage.setItem('ADMIN_SECRET', secret);
  }, adminSecret);
  
  // Reload or go to a protected page to ensure authentication is picked up
  await page.goto(`${baseUrl}/valueStreams`, { waitUntil: 'networkidle' });

  console.log('Taking screenshot of ValueStream...');
  await page.goto(`${baseUrl}/valueStream/main`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${imageDir}/ValueStream.png` });

  console.log('Taking screenshot of ValueStream List...');
  await page.goto(`${baseUrl}/valueStreams`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/valuestream-list.png` });

  console.log('Taking screenshot of Customer List...');
  await page.goto(`${baseUrl}/customers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/customers-list.png` });

  console.log('Taking screenshot of Customer Detail (Full View)...');
  await page.goto(`${baseUrl}/customer/c1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/customer-detail.png` });

  console.log('Taking screenshot of Customer Detail (Custom Fields tab scrolled)...');
  try {
    const tab = page.getByRole('button', { name: /Custom Fields/i });
    await tab.click({ timeout: 5000 });
    await tab.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Custom Fields tab not found, skipping scroll/click');
  }
  await page.screenshot({ path: `${imageDir}/customer-detail-fields.png` });

  console.log('Taking screenshot of Customer Detail (Targeted Work Items tab scrolled)...');
  try {
    const tab = page.getByRole('button', { name: /Targeted Work Items/i });
    await tab.click({ timeout: 5000 });
    await tab.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Targeted Work Items tab not found, skipping scroll/click');
  }
  await page.screenshot({ path: `${imageDir}/customer-detail-workitems.png` });

  console.log('Taking screenshot of Customer Detail (TCV History tab scrolled)...');
  try {
    const tab = page.getByRole('button', { name: /TCV History/i });
    await tab.click({ timeout: 5000 });
    await tab.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('TCV History tab not found, skipping scroll/click');
  }
  await page.screenshot({ path: `${imageDir}/customer-detail-history.png` });

  console.log('Taking screenshot of Customer Detail (Support Health tab scrolled)...');
  try {
    // The tab is labeled "Support (X)" in the code
    const tab = page.getByRole('button', { name: /^Support/i });
    await tab.click({ timeout: 5000 });
    await tab.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log('Support tab not found, skipping scroll/click');
  }
  await page.screenshot({ path: `${imageDir}/customer-detail-support.png` });

  console.log('Taking screenshot of Work Item List...');
  await page.goto(`${baseUrl}/workitems`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/workitems-list.png` });

  console.log('Taking screenshot of Work Item Detail (Full View)...');
  await page.goto(`${baseUrl}/workitem/f1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/workitem-detail.png` });

  console.log('Taking screenshot of Work Item Detail (Targeted Customers tab scrolled)...');
  try {
    const tab = page.getByRole('button', { name: /Targeted Customers/i });
    await tab.click({ timeout: 5000 });
    await tab.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Targeted Customers tab not found, skipping scroll/click');
  }
  await page.screenshot({ path: `${imageDir}/workitem-detail-customers.png` });

  console.log('Taking screenshot of Work Item Detail (Issues tab scrolled)...');
  try {
    const tab = page.getByRole('button', { name: /^Issues/i });
    await tab.click({ timeout: 5000 });
    await tab.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Issues tab not found, skipping scroll/click');
  }
  await page.screenshot({ path: `${imageDir}/workitem-detail-issues.png` });

  console.log('Taking screenshot of Team List...');
  await page.goto(`${baseUrl}/teams`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/teams-list.png` });

  console.log('Taking screenshot of Team Detail...');
  await page.goto(`${baseUrl}/team/t1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/team-detail.png` });

  console.log('Taking screenshot of Issue Detail...');
  await page.goto(`${baseUrl}/issue/e1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/issue-detail.png` });

  console.log('Taking screenshot of Sprints Management...');
  await page.goto(`${baseUrl}/sprints`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/sprints-list.png` });

  console.log('Taking screenshot of Support Health...');
  await page.goto(`${baseUrl}/support`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/support-health.png` });

  console.log('Taking screenshot of Settings...');
  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${imageDir}/settings.png` });

  await browser.close();
  console.log('All screenshots taken successfully at 75% scale!');
})();
