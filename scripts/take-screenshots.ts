/**
 * Playwright script to capture all User Guide screenshots.
 *
 * Prerequisites:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   1. Start the app: npm run dev
 *   2. Run: npx playwright test scripts/take-screenshots.ts
 *      — or simply: npx tsx scripts/take-screenshots.ts
 *
 * The script expects:
 *   - The app running at http://localhost:5173
 *   - At least one entity of each type (customer, work item, issue, team, sprint, value stream)
 *   - ADMIN_SECRET set (or auth disabled)
 *
 * Output: web-client/public/images/<name>.png
 */

import { chromium, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const OUTPUT_DIR = path.resolve(__dirname, '../web-client/public/images');
const VIEWPORT = { width: 1440, height: 900 };

// Wait for network to settle and content to render
async function waitForStable(page: Page, ms = 1500) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

// Click a tab button by its visible text (partial match)
async function clickTab(page: Page, labelText: string) {
  // Tab buttons contain dynamic counts like "Targeted Work Items (3)",
  // so we match on the static prefix
  const tab = page.locator('button').filter({ hasText: labelText }).first();
  await tab.click();
  await page.waitForTimeout(800);
}

// Click a settings sub-tab by text
async function clickSubTab(page: Page, labelText: string) {
  const tab = page.locator('button, a').filter({ hasText: labelText }).first();
  await tab.click();
  await page.waitForTimeout(500);
}

async function screenshot(page: Page, name: string) {
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  Captured: ${name}.png`);
}

// Get the first entity ID from a list page by reading the first row link
async function getFirstEntityId(page: Page, listPath: string): Promise<string | null> {
  await page.goto(`${BASE_URL}${listPath}`);
  await waitForStable(page);

  // List pages render rows as links or clickable elements — grab the first href
  const firstLink = page.locator('a[href]').filter({ hasText: /.+/ }).first();
  const href = await firstLink.getAttribute('href').catch(() => null);
  if (!href) return null;

  // Extract ID from paths like /customer/abc123
  const match = href.match(/\/[^/]+\/([^/]+)$/);
  return match ? match[1] : null;
}

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // --- Authentication ---
  console.log('\n--- Authentication ---');
  if (ADMIN_SECRET) {
    await page.goto(BASE_URL);
    await waitForStable(page);

    // Check if we landed on login page
    const isLoginPage = await page.locator('input[type="password"]').isVisible().catch(() => false);
    if (isLoginPage) {
      await screenshot(page, 'login');
      await page.locator('input[type="password"]').fill(ADMIN_SECRET);
      await page.locator('button[type="submit"], button').filter({ hasText: /login|submit|enter/i }).first().click();
      await waitForStable(page);
      console.log('  Logged in.');
    }
  } else {
    await page.goto(BASE_URL);
    await waitForStable(page);
    // Try to capture login page if visible
    const isLoginPage = await page.locator('input[type="password"]').isVisible().catch(() => false);
    if (isLoginPage) {
      await screenshot(page, 'login');
      console.log('  WARNING: Login page shown but no ADMIN_SECRET provided. Set ADMIN_SECRET env var.');
      await browser.close();
      process.exit(1);
    }
  }

  // --- Discover entity IDs ---
  console.log('\n--- Discovering entities ---');

  const customerId = await getFirstEntityId(page, '/customers');
  console.log(`  Customer: ${customerId || 'NONE'}`);

  const workItemId = await getFirstEntityId(page, '/workitems');
  console.log(`  WorkItem: ${workItemId || 'NONE'}`);

  const teamId = await getFirstEntityId(page, '/teams');
  console.log(`  Team: ${teamId || 'NONE'}`);

  // Issues don't have a list page — find one from a work item
  let issueId: string | null = null;
  if (workItemId) {
    await page.goto(`${BASE_URL}/workitem/${workItemId}`);
    await waitForStable(page);
    await clickTab(page, 'Engineering Issues');
    const issueLink = page.locator('a[href*="/issue/"]').first();
    const issueHref = await issueLink.getAttribute('href').catch(() => null);
    if (issueHref) {
      const match = issueHref.match(/\/issue\/([^/]+)$/);
      issueId = match ? match[1] : null;
    }
  }
  console.log(`  Issue: ${issueId || 'NONE'}`);

  // Find first value stream
  let valueStreamId: string | null = null;
  await page.goto(`${BASE_URL}/valueStreams`);
  await waitForStable(page);
  const vsLink = page.locator('a[href*="/valueStream/"]').first();
  const vsHref = await vsLink.getAttribute('href').catch(() => null);
  if (vsHref) {
    const match = vsHref.match(/\/valueStream\/([^/]+)$/);
    valueStreamId = match ? match[1] : null;
  }
  console.log(`  ValueStream: ${valueStreamId || 'NONE'}`);

  // =====================================================================
  // ENTITY LIST PAGES
  // =====================================================================
  console.log('\n--- List Pages ---');

  // Customers list
  await page.goto(`${BASE_URL}/customers`);
  await waitForStable(page);
  await screenshot(page, 'customers-list');

  // Work Items list
  await page.goto(`${BASE_URL}/workitems`);
  await waitForStable(page);
  await screenshot(page, 'workitems-list');

  // Teams list — no dedicated screenshot in guide but may be useful
  // (skipped — not in TODO list)

  // Sprints list
  await page.goto(`${BASE_URL}/sprints`);
  await waitForStable(page);
  await screenshot(page, 'sprints-list');

  // ValueStream list
  await page.goto(`${BASE_URL}/valueStreams`);
  await waitForStable(page);
  await screenshot(page, 'valuestream-list');

  // Support Health
  await page.goto(`${BASE_URL}/support`);
  await waitForStable(page);
  await screenshot(page, 'support-health');

  // =====================================================================
  // CUSTOMER DETAIL + TABS
  // =====================================================================
  if (customerId) {
    console.log('\n--- Customer Detail ---');
    await page.goto(`${BASE_URL}/customer/${customerId}`);
    await waitForStable(page);
    await screenshot(page, 'customer-detail');

    // Tab: Custom Fields (first tab, usually already active)
    await clickTab(page, 'Custom Fields');
    await screenshot(page, 'customer-detail-fields');

    // Tab: Targeted Work Items
    await clickTab(page, 'Targeted Work Items');
    await screenshot(page, 'customer-detail-workitems');

    // Tab: TCV History
    await clickTab(page, 'TCV History');
    await screenshot(page, 'customer-detail-history');

    // Tab: Support & Health
    await clickTab(page, 'Support');
    await waitForStable(page, 800);
    await screenshot(page, 'customer-detail-support');
  } else {
    console.log('  SKIP: No customer found');
  }

  // =====================================================================
  // WORK ITEM DETAIL + TABS
  // =====================================================================
  if (workItemId) {
    console.log('\n--- Work Item Detail ---');
    await page.goto(`${BASE_URL}/workitem/${workItemId}`);
    await waitForStable(page);
    await screenshot(page, 'workitem-detail');

    // Tab: Targeted Customers
    await clickTab(page, 'Targeted Customers');
    await screenshot(page, 'workitem-detail-customers');

    // Tab: Engineering Issues
    await clickTab(page, 'Engineering Issues');
    await screenshot(page, 'workitem-detail-issues');

    // Tab: Aha! Integration (may not exist if Aha not configured)
    const ahaTab = page.locator('button').filter({ hasText: 'Aha!' });
    if (await ahaTab.isVisible().catch(() => false)) {
      await ahaTab.click();
      await page.waitForTimeout(800);
      await screenshot(page, 'workitem-detail-aha');
    } else {
      console.log('  SKIP: Aha! tab not visible (not configured in settings)');
    }
  } else {
    console.log('  SKIP: No work item found');
  }

  // =====================================================================
  // ISSUE DETAIL + TABS
  // =====================================================================
  if (issueId) {
    console.log('\n--- Issue Detail ---');
    await page.goto(`${BASE_URL}/issue/${issueId}`);
    await waitForStable(page);
    await screenshot(page, 'issue-detail');

    // Tab: Sprint Effort Distribution
    await clickTab(page, 'Sprint Effort');
    await screenshot(page, 'issue-detail-effort');
  } else {
    console.log('  SKIP: No issue found');
  }

  // =====================================================================
  // TEAM DETAIL + TABS
  // =====================================================================
  if (teamId) {
    console.log('\n--- Team Detail ---');
    await page.goto(`${BASE_URL}/team/${teamId}`);
    await waitForStable(page);
    await screenshot(page, 'team-detail');

    // Tab: Capacity Overrides
    await clickTab(page, 'Capacity Overrides');
    await screenshot(page, 'team-detail-capacity');

    // Tab: Members
    await clickTab(page, 'Members');
    await screenshot(page, 'team-detail-members');
  } else {
    console.log('  SKIP: No team found');
  }

  // =====================================================================
  // VALUESTREAM GRAPH VIEW
  // =====================================================================
  if (valueStreamId) {
    console.log('\n--- ValueStream Graph ---');
    await page.goto(`${BASE_URL}/valueStream/${valueStreamId}`);
    await waitForStable(page, 3000); // Graph needs more time to render
    await screenshot(page, 'ValueStream');
  } else {
    console.log('  SKIP: No value stream found');
  }

  // =====================================================================
  // SUPPORT — AI DISCOVERY (capture the button area, can't trigger real AI)
  // =====================================================================
  // Already captured as support-health above. AI results require real LLM call.
  console.log('\n  NOTE: AI Support Discovery results require a live LLM — capture manually.');

  // =====================================================================
  // SETTINGS TABS
  // =====================================================================
  console.log('\n--- Settings Tabs ---');

  // Settings overview (General tab is default)
  await page.goto(`${BASE_URL}/settings`);
  await waitForStable(page);
  await screenshot(page, 'settings');

  // General Project
  await page.goto(`${BASE_URL}/settings?tab=general`);
  await waitForStable(page);
  await screenshot(page, 'settings-general');

  // Persistence
  await page.goto(`${BASE_URL}/settings?tab=persistence`);
  await waitForStable(page);
  await screenshot(page, 'settings-persistence');

  // Jira Integration
  await page.goto(`${BASE_URL}/settings?tab=jira`);
  await waitForStable(page);
  await screenshot(page, 'settings-jira');

  // Aha! Integration
  await page.goto(`${BASE_URL}/settings?tab=aha`);
  await waitForStable(page);
  await screenshot(page, 'settings-aha');

  // AI & LLM
  await page.goto(`${BASE_URL}/settings?tab=ai`);
  await waitForStable(page);
  await screenshot(page, 'settings-ai');

  // LDAP
  await page.goto(`${BASE_URL}/settings?tab=ldap`);
  await waitForStable(page);
  await screenshot(page, 'settings-ldap');

  // =====================================================================
  // DONE
  // =====================================================================
  await browser.close();

  console.log(`\n--- Done! Screenshots saved to ${OUTPUT_DIR} ---`);
  console.log('\nManual captures still needed:');
  console.log('  - AI Support Discovery results (requires live LLM call)');
  console.log('  - Login page (if auth was already cached)\n');
}

main().catch(err => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
