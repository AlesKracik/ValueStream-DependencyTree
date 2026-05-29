/**
 * Migration: stamp `_version: 0` on any documents in the six entity collections
 * that don't already have one. Idempotent — safe to run multiple times.
 *
 * Usage (from project root):
 *   cd backend
 *   npx tsx scripts/add-version-field.ts
 *
 * Or via npm script:
 *   npm --prefix backend run migrate:add-version
 *
 * Note: this script is OPTIONAL. The server's OCC logic treats a missing
 * `_version` field as `_version: 0` and stamps it on first write, so legacy
 * documents work without migration. Running this just normalises the data.
 */
import { augmentConfig } from '../src/utils/configHelpers';
import { getDb } from '../src/utils/mongoServer';
import { getFullSettingsAsync } from '../src/services/secretManager';
import { ALLOWED_COLLECTIONS } from '../src/utils/constants';
import { logger } from '../src/utils/logger';

async function main() {
  const settings = await getFullSettingsAsync();
  if (!settings.persistence?.mongo?.app?.uri) {
    logger.error('App MongoDB not configured — cannot run migration.');
    process.exit(1);
  }

  const db = await getDb(augmentConfig(settings, 'app'), 'app', true);

  let grandTotal = 0;
  for (const collection of ALLOWED_COLLECTIONS) {
    const result = await db.collection(collection).updateMany(
      { _version: { $exists: false } },
      { $set: { _version: 0 } }
    );
    logger.info(
      { collection, stamped: result.modifiedCount },
      `Stamped _version on ${result.modifiedCount} document(s) in ${collection}`
    );
    grandTotal += result.modifiedCount;
  }

  logger.info({ total: grandTotal }, 'Migration complete');
  process.exit(0);
}

main().catch(err => {
  logger.error(err, 'Migration failed');
  process.exit(1);
});
