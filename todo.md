* bugs
* features
  • if there is jira associated with workitem that is in progress, move the WI status to development. if all jiras are done, move WI to done
  • add releases
  • filter entities based on more properties e.g status, TCV etc.
  • snowflake integration
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* code readability, organization, DRY and overall architecture
  14. Frontend: ValueStreamContext mixes 3 concerns

  Notification modal state + UI state preservation + entity mutations
  Fix: Separate into NotificationContext + UIStateContext
  15. Frontend: Delete-with-confirmation pattern repeated 6+ times identically

  Fix: Extract useDeleteWithConfirm(deleteFn, navigatePath) hook
  16. Missing shared API contract types

  No ApiResponse<T> / ApiError in @valuestream/shared-types; frontend uses any for network responses
  Fix: Add response wrapper types to shared package
  Low
  17. Single-letter variable aliases (f for WorkItem, e for Issue, t for Team) reduce readability in graph layout code

  18. Backend: Inconsistent logging — mix of console.log and fastify.log

  19. Documentation structure (already noted in todo.md) — paragraphs in wrong places, no clear hierarchy
  * update doc structure. it sometimes has paragraphs in wrong places. Also does not have a good logical hierarchy going from high level tree structure to individiual areas and eventually details
  * split settings on FE and BE related to manage the updates properly
* security
