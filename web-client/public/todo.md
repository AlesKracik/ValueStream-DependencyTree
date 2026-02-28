
## Post-Persistence Refactoring Prompts

1.  Create a section about sprints, similar to how customers works.
2.  For sprint, merge the filter page and detail page. No filtering is needed. Every sprint name should be inline editable.
3.  Align sprints page visual with the customers (listItem layout).
4.  In work item edit, make target customers and epics into tabs.
5.  Display the number of associated entities in the Work Item edit tabs (e.g., "Epics (3)", "Targeted Customers (2)").
6.  Dashboard entity should have persisted parameters (filters) that define visibility.
7.  Add TCV and Score filters to the Dashboard edit page. Ensure the release filter is visually consistent with other inputs.
8.  Stack dashboard edit filters vertically to prevent horizontal overflow.
9.  Rename filters to specify "Name Filter" (e.g., Customer Name Filter). Group TCV under Customer and Score under Work Item.
10. Add `score` to `WorkItem` as a persistent attribute in the database. Recalculate automatically on any data change.
11. Centered and constrained width list pages (Customers, Work Items, Teams, Sprints) to match the look of detail pages.
12. Distinguish between persisted Dashboard Attributes (Base Filters) and Transient Page Filters. Transient filters should be session-only, not modify the DB, and the view should be a logical AND between Base and Transient filters.


* dont do anything, just think: there is a jira bug for every existing customer issues. the status drives if its a new (Draft, this needs attention to investigate), noop (Blocked, blocked on customer or 3rd party, no need to do anything) or  
in-progress (anything else that is not closed or canceled, actively worked on). the jira description also contains info, if the issue is still repeating or not. I want to extend this app to also nicely show on customer page, what is the    
status of the customer from this point of view. 
propose visual solution. also propose if you can somehow integrate with LLM model to       
provide some nice summary
• dont do anything, just think: now the TCV is either exisitng or potential. but as time goes on, the potential will gradually get to existing. so we need to introduce timeseries to the existing. propose a solution how to do that
