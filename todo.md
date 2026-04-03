* bugs
* features
  • if there is jira associated with workitem that is in progress, move the WI status to development. if all jiras are done, move WI to done
  • add releases
  • filter entities based on more properties e.g status, TCV etc.
  • snowflake integration
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* code readability, organization, DRY and overall architecture
  16. Missing shared API contract types
  No ApiResponse<T> / ApiError in @valuestream/shared-types; frontend uses any for network responses
  Fix: Add response wrapper types to shared package


  Architecture & Organization Issues
Oversized Files (should be split)
File	Lines	Problem
SupportPage.tsx	797	AI search, Glean OAuth, issue management, filtering all in one component
useGraphBuilder.ts	727	Node construction, edge construction, layout, filtering all combined
useValueStreamData.ts	391	Data fetching + persistence + state + entity CRUD intertwined
useGraphFilters.ts	357	Complex filter logic in one massive function
PersistenceSettings.tsx	768	Mongo config + AWS SSO + encryption + DB selection all in one
configHelpers.ts	261	Settings I/O + masking + secret extraction + config augmentation
mongoServer.ts	273	Connection pool + SSRF protection + AWS credentials


Code in Wrong Layer
Business logic in routes: entity.ts has cascade deletion logic and score recomputation triggers that belong in a service layer
Business logic in components: SupportPage.tsx has customer sorting, issue expiration cleanup, AI prompt building
Persistence in hooks: useValueStreamData.ts mixes data persistence with state management
Repeated DB init in routes: getDb(augmentConfig(settings, 'app'), 'app', true) repeated across all route handlers — should be middleware
Inconsistent Patterns
Route export styles: Some use export const xRoutes: FastifyPluginAsync, others use export async function xRoutes(app: FastifyInstance)
Naming verbs: Mixed get/fetch/discover prefixes with no convention
Barrel files: Only providers/index.ts and settings/index.ts use them — hooks, components/common, components/nodes, contexts don't



DRY Violations (Top Priority)
1. Test Connection Pattern (Settings pages)
Duplicated across AhaSettings.tsx, JiraSettings.tsx, PersistenceSettings.tsx:

Identical useState<{ success: boolean; message: string } | null> pattern
Identical isTesting/isSyncing/isImporting loading states
Nearly identical fetch + error handling logic
Fix: Extract a useAsyncOperation or useConfigTestConnection hook
2. Result Display Component
Same styled result <div> copy-pasted 6+ times across settings pages with identical backgroundColor, color, border patterns.

Fix: Create a reusable <ResultDisplay> component
3. Settings Form Labels
Identical <label style={{...}}> + <input> patterns repeated 10+ times across settings forms.

Fix: Create a <SettingsField> component
4. Detail Page Creation Pattern
Same isNew / draft / save / generateId / setTimeout(onBack) pattern in CustomerPage, WorkItemPage, TeamPage, SprintPage.

Fix: Extract a useDetailPageState hook
5. Backend Test Endpoint Pattern
jira.ts, aha.ts, mongo.ts all follow identical try/catch + { success, error } response patterns.

Fix: Extract a test handler factory function
6. MongoDB Config Validation
if (!settings.persistence?.mongo?.app?.uri) throw new Error(...) repeated in entity.ts at lines 36, 67, 94.

Fix: Extract validateMongoConfig(settings, role) utility
7. Tab Navigation (Settings)
Same setSearchParams subtab logic in JiraSettings, LdapSettings, PersistenceSettings.

Fix: Extract useTabNavigation hook



Test Coverage Gaps
No tests for metricsService.ts (critical calculation service)
No tests for useCustomerHealth.ts
No tests for security.ts




Suggested Priority Order
Priority	What	Impact
1 - High	Extract useAsyncOperation hook + <ResultDisplay> + <SettingsField> components	Eliminates ~6 DRY violations across all settings pages
2 - High	Split SupportPage.tsx into page + useSupportIssues + useAISearch hooks	Biggest single-file readability win
3 - High	Extract entity route logic into service layer + DB middleware	Cleaner backend architecture
4 - Medium	Extract useDetailPageState hook for entity pages	Reduces 4 similar page patterns
5 - Medium	Split useGraphBuilder.ts into nodes/edges/layout utilities	Major hook readability improvement
6 - Medium	Split configHelpers.ts and mongoServer.ts by concern	Backend SRP
7 - Low	Standardize naming conventions and barrel file usage	Consistency

* security
