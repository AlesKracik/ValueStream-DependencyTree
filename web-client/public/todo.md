* bugs

* features
  * dont do anything, just think: there is a jira bug for every existing customer issues. the status drives if its a new (Draft, this needs attention to investigate), noop (Blocked, blocked on customer or 3rd party, no need to do anything) or in-progress (anything else that is not closed or canceled, actively worked on). the jira description also contains info, if the issue is still repeating or not. I want to extend this app to also nicely show on customer page, what is the status of the customer from this point of view. propose visual solution. also propose if you can somehow integrate with LLM model to provide some nice summary
  * workitem  integration with Aha
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* archive old sprints
* code readabilty and architecture
  * find parts copy&pasted (or very simmilar) on multiple places and refactor them to be reusable
    * React Flow Node Duplication: CustomerNode.tsx, TeamNode.tsx, and WorkItemNode.tsx duplicate identical inline styling logic for drawing responsive circular nodes, applying box shadows, absolute-positioning text labels beneath the nodes, scaling base sizes, and wiring up transparent <Handle> components. They should be refactored into a single <BaseCircleNode /> wrapper component. ✅
    * Page Container and Loading States Duplication: Almost every page (CustomerPage, EpicPage, TeamPage, WorkItemPage, DashboardEditPage, etc.) duplicates the exact same boilerplate code for handling if (loading) return ..., if (error) return ..., and wrapping the main content in <div className={styles.pageContainer}>. This should be extracted into a reusable <PageWrapper> layout component that centralizes data-fetching UI states.
* security

