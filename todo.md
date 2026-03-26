* bugs
* features
  • if there is jira associated with workitem that is in progress, move the WI status to development. if all jiras are done, move WI to done
  • add releases
  • filter entities based on more properties e.g status, TCV etc.
  • snowflake integration
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* code readability, organization, DRY and overall architecture
  *Tier 1 — Foundational (do first, unblocks everything else)
  2	Async loadSettings() + Fastify decorator	Consolidates 7 copy-pasted settings-loading patterns into one. Make it async (fs.promises) from the start to fix the sync I/O blocking issue.
  3	Typed request bodies	Add Fastify schema validation + FastifyRequest<{ Body: T }> generics. Turns runtime crashes into compile-time errors.
  Tier 2 — High-value cleanup
  #	Item	Why
  4	Shared constants	ALLOWED_COLLECTIONS, collection name strings ('workItems', 'sprints', etc.) — one file, import everywhere. Prevents typo-driven silent failures.
  5	Indexes at startup, not per-write	One-line fix, measurable latency improvement. Move createIndex calls to mongo plugin init.
  6	Jira/Aha config extraction	resolveJiraConfig(config) and resolveAhaConfig(config) helpers. Each deduplicates ~10 lines across 3 and 2 endpoints respectively.
  7	Standardize error handling	Promote handleError to shared utility or Fastify error handler plugin. Decide: test endpoints return 200 + success: false, everything else uses proper HTTP status codes. Document the convention.
  Tier 3 — Structure improvements
  #	Item	Why
  8	Split configHelpers.ts	Currently mixes 4 unrelated concerns. Split into settingsMask.ts, mongoConfig.ts, fiscalCalendar.ts. Move logQuery to dbHelpers.ts.
  9	Extract workspace service	Move the ~65-line /api/workspace handler logic into services/workspaceService.ts. Route handler becomes parse → call → respond.
  10	Shared businessLogic.ts	Once #1 (shared types) exists, move pure calculation functions (RICE, TCV, effort) to the shared package.
  Tier 4 — Nice to have
  #	Item	Why
  11	stripMongoIds() utility	Low risk, but a simple dbHelpers.ts function removes 15+ repeated .map(({ _id, ...rest }) => rest) calls.
  12	Merge entity POST handlers	Only if you're actively changing those routes. Optional :id param or shared upsertEntity().
  13	AWS SSO helper	Re-evaluate after checking current duplication (reduced after /sso/credentials removal).
  New items (not in original list)
  #	Item	Why
  14	Request-scoped logging	Add a Fastify request-id plugin. Replace hardcoded [MONGO_DEBUG] console.logs with structured, correlated logging.
  15	Graceful shutdown	Wire clearMongoCache() / stopMongoCleanup() to process SIGTERM/SIGINT signals. Prevents connection leaks on restart.
  * update doc structure. it sometimes has paragraphs in wrong places. Also does not have a good logical hierarchy going from high level tree structure to individiual areas and eventually details
 
  * split settings on FE and BE related to manage the updates properly
* security
