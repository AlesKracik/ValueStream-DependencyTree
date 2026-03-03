* bugs
* features
  • [x] make the rice score also a number, i.e. with comma for each 3 orders of magnitude
  • archive oldest past sprint
  • 2line epic entry in epic tab of workitem
• sprint headers should be continous and more visually aligned
  * dont do anything, just think: there is a jira bug for every existing customer issues. the status drives if its a new (Draft, this needs attention to investigate), noop (Blocked, blocked on customer or 3rd party, no need to do anything) or in-progress (anything else that is not closed or canceled, actively worked on). the jira description also contains info, if the issue is still repeating or not. I want to extend this app to also nicely show on customer page, what is the status of the customer from this point of view. propose visual solution. also propose if you can somehow integrate with LLM model to provide some nice summary
  * workitem  integration with Aha
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* archive old sprints
* code readabilty and architecture
  * find parts copy&pasted (or very simmilar) on multiple places and refactor them to be reusable 
* security
