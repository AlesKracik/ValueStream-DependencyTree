* bugs
  • [FIXED] sprints belong to a q in which they end
  • [FIXED] does not create db even if its checked
  • [FIXED] GanttBarNode.tsx - it's using epic.remaining_md which doesn't exist
  • does not check the admin password on FE
  • assigning epic to workitem causes recalc, which causes past sprints to be null?
  • add example settings.json
  • make import of import explicit on button is setting
  • make lists customer, etc sorted
* features
  * dont do anything, just think: there is a jira bug for every existing customer issues. the status drives if its a new (Draft, this needs attention to investigate), noop (Blocked, blocked on customer or 3rd party, no need to do anything) or in-progress (anything else that is not closed or canceled, actively worked on). the jira description also contains info, if the issue is still repeating or not. I want to extend this app to also nicely show on customer page, what is the status of the customer from this point of view. propose visual solution. also propose if you can somehow integrate with LLM model to provide some nice summary
  * workitem  integration with Aha
  * Gantt view on Customer page
  * LLM summary of customer status
  * Fiscal Year calculation (determin FY/Q relative to a fiscal start month) - refactored to shared utility
