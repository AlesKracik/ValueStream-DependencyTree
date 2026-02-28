

10. Add `score` to `WorkItem` as a persistent attribute in the database. Recalculate automatically on any data change.
11. Centered and constrained width list pages (Customers, Work Items, Teams, Sprints) to match the look of detail pages.
12. Distinguish between persisted Dashboard Attributes (Base Filters) and Transient Page Filters. Transient filters should be session-only, not modify the DB, and the view should be a logical AND between Base and Transient filters.


* dont do anything, just think: there is a jira bug for every existing customer issues. the status drives if its a new (Draft, this needs attention to investigate), noop (Blocked, blocked on customer or 3rd party, no need to do anything) or  
in-progress (anything else that is not closed or canceled, actively worked on). the jira description also contains info, if the issue is still repeating or not. I want to extend this app to also nicely show on customer page, what is the    
status of the customer from this point of view. 
propose visual solution. also propose if you can somehow integrate with LLM model to       
provide some nice summary
• dont do anything, just think: now the TCV is either exisitng or potential. but as time goes on, the potential will gradually get to existing. so we need to introduce timeseries to the existing. propose a solution how to do that
