/**
 * Playwright script to capture all User Guide screenshots.
 *
 * Prerequisites:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   1. Start the app: npm run dev
 *   2. Run: ADMIN_SECRET=<secret> npx tsx scripts/take-screenshots.ts
 *
 * Output: web-client/public/images/<name>.png
 */

import { chromium, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const OUTPUT_DIR = path.resolve(__dirname, '../web-client/public/images');
const VIEWPORT = { width: 1440, height: 900 };

async function waitForStable(page: Page, ms = 1500) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function clickTab(page: Page, labelText: string) {
  const tab = page.locator('button').filter({ hasText: labelText }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

async function screenshot(page: Page, name: string) {
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  ✓ ${name}.png`);
}

// Discover entity IDs via the backend API
async function discoverEntities(): Promise<{
  customerId: string | null;
  workItemId: string | null;
  teamId: string | null;
  issueId: string | null;
  valueStreamId: string | null;
}> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (ADMIN_SECRET) headers['Authorization'] = `Bearer ${ADMIN_SECRET}`;

  const fetchFirst = async (collection: string): Promise<string | null> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/data/${collection}`, { headers });
      const json = await res.json() as any;
      // Response format is { <collection>: [...] } e.g. { customers: [...] }
      const items = json[collection] || json.data || json;
      if (Array.isArray(items) && items.length > 0) return items[0].id;
    } catch (e) { /* ignore */ }
    return null;
  };

  const [customerId, workItemId, teamId, issueId, valueStreamId] = await Promise.all([
    fetchFirst('customers'),
    fetchFirst('workItems'),
    fetchFirst('teams'),
    fetchFirst('issues'),
    fetchFirst('valueStreams'),
  ]);

  return { customerId, workItemId, teamId, issueId, valueStreamId };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Discover entities via API first
  console.log('\n--- Discovering entities via API ---');
  const entities = await discoverEntities();
  console.log(`  Customer:    ${entities.customerId || 'NONE'}`);
  console.log(`  WorkItem:    ${entities.workItemId || 'NONE'}`);
  console.log(`  Team:        ${entities.teamId || 'NONE'}`);
  console.log(`  Issue:       ${entities.issueId || 'NONE'}`);
  console.log(`  ValueStream: ${entities.valueStreamId || 'NONE'}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // --- Authentication ---
  console.log('\n--- Authentication ---');
  await page.goto(BASE_URL);
  await waitForStable(page);

  const isLoginPage = await page.locator('input[type="password"]').isVisible().catch(() => false);
  if (isLoginPage) {
    await screenshot(page, 'login');
    if (!ADMIN_SECRET) {
      console.log('  ✗ Login page shown but no ADMIN_SECRET. Set ADMIN_SECRET env var.');
      await browser.close();
      process.exit(1);
    }
    await page.locator('input[type="password"]').fill(ADMIN_SECRET);
    await page.locator('button').filter({ hasText: /login|submit|enter/i }).first().click();
    await waitForStable(page);
    console.log('  Logged in.');
  }

  // =====================================================================
  // LIST PAGES
  // =====================================================================
  console.log('\n--- List Pages ---');

  await page.goto(`${BASE_URL}/customers`);
  await waitForStable(page);
  await screenshot(page, 'customers-list');

  await page.goto(`${BASE_URL}/workitems`);
  await waitForStable(page);
  await screenshot(page, 'workitems-list');

  await page.goto(`${BASE_URL}/sprints`);
  await waitForStable(page);
  await screenshot(page, 'sprints-list');

  await page.goto(`${BASE_URL}/valueStreams`);
  await waitForStable(page);
  await screenshot(page, 'valuestream-list');

  await page.goto(`${BASE_URL}/support`);
  await waitForStable(page);
  await screenshot(page, 'support-health');

  // =====================================================================
  // CUSTOMER DETAIL + TABS
  // =====================================================================
  console.log('\n--- Customer Detail ---');
  const custPath = entities.customerId ? `/customer/${entities.customerId}` : '/customers';
  await page.goto(`${BASE_URL}${custPath}`);
  await waitForStable(page);
  if (entities.customerId) {
    // Click first list item to navigate to detail
    await screenshot(page, 'customer-detail');

    await clickTab(page, 'Custom Fields');
    await screenshot(page, 'customer-detail-fields');

    await clickTab(page, 'Targeted Work Items');
    await screenshot(page, 'customer-detail-workitems');

    await clickTab(page, 'TCV History');
    await screenshot(page, 'customer-detail-history');

    await clickTab(page, 'Support');
    await waitForStable(page, 800);
    await screenshot(page, 'customer-detail-support');
  } else {
    console.log('  No customers — capturing empty list');
  }

  // =====================================================================
  // WORK ITEM DETAIL + TABS
  // =====================================================================
  console.log('\n--- Work Item Detail ---');
  if (entities.workItemId) {
    await page.goto(`${BASE_URL}/workitem/${entities.workItemId}`);
    await waitForStable(page);
    await screenshot(page, 'workitem-detail');

    await clickTab(page, 'Targeted Customers');
    await screenshot(page, 'workitem-detail-customers');

    await clickTab(page, 'Engineering Issues');
    await screenshot(page, 'workitem-detail-issues');

    if (await clickTab(page, 'Aha!')) {
      await screenshot(page, 'workitem-detail-aha');
    } else {
      console.log('  Aha! tab not visible (not configured)');
    }
  } else {
    console.log('  No work items — skipping detail');
  }

  // =====================================================================
  // ISSUE DETAIL + TABS
  // =====================================================================
  console.log('\n--- Issue Detail ---');
  if (entities.issueId) {
    await page.goto(`${BASE_URL}/issue/${entities.issueId}`);
    await waitForStable(page);
    await screenshot(page, 'issue-detail');

    await clickTab(page, 'Sprint Effort');
    await screenshot(page, 'issue-detail-effort');
  } else {
    console.log('  No issues — skipping detail');
  }

  // =====================================================================
  // TEAM DETAIL + TABS
  // =====================================================================
  console.log('\n--- Team Detail ---');
  if (entities.teamId) {
    await page.goto(`${BASE_URL}/team/${entities.teamId}`);
    await waitForStable(page);
    await screenshot(page, 'team-detail');

    await clickTab(page, 'Capacity Overrides');
    await screenshot(page, 'team-detail-capacity');

    await clickTab(page, 'Members');
    await screenshot(page, 'team-detail-members');
  } else {
    console.log('  No teams — skipping detail');
  }

  // =====================================================================
  // VALUESTREAM GRAPH VIEW
  // =====================================================================
  console.log('\n--- ValueStream Graph ---');
  if (entities.valueStreamId) {
    await page.goto(`${BASE_URL}/valueStream/${entities.valueStreamId}`);
    await waitForStable(page, 3000);
    await screenshot(page, 'ValueStream');
  } else {
    console.log('  No value streams — skipping graph');
  }

  // =====================================================================
  // SUPPORT — AI DISCOVERY
  // =====================================================================
  console.log('\n  NOTE: AI Support Discovery results require a live LLM — capture manually as support-ai-discovery.png');

  // =====================================================================
  // SETTINGS TABS
  // =====================================================================
  console.log('\n--- Settings Tabs ---');

  await page.goto(`${BASE_URL}/settings`);
  await waitForStable(page);
  await screenshot(page, 'settings');

  for (const tab of ['general', 'persistence', 'jira', 'aha', 'ai', 'ldap']) {
    await page.goto(`${BASE_URL}/settings?tab=${tab}`);
    await waitForStable(page);
    await screenshot(page, `settings-${tab}`);
  }

  // =====================================================================
  // DONE
  // =====================================================================
  await browser.close();

  const captured = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png')).length;
  console.log(`\n--- Done! ${captured} screenshots saved to ${OUTPUT_DIR} ---`);

  if (!entities.customerId || !entities.workItemId || !entities.issueId || !entities.teamId || !entities.valueStreamId) {
    console.log('\nSome detail pages were skipped due to missing entities.');
    console.log('Add data and re-run to capture those screenshots.');
  }
  console.log('\nManual capture needed: support-ai-discovery.png (requires live LLM call)\n');
}

main().catch(err => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
