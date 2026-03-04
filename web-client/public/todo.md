* bugs
  • change the promtp to Analyze the following Jira support tickets for customer ${customer?.name}. Summarize the root causes if any and try to find correlations between them.
  Pay special attention to 'New / Untriaged' issues as they are the most critical.
  For each issue, you have the summary, description, and the last comment to help you understand the context and recent activity. The output should be short - 1 paragraph for the findings, 1 paragraph for the conclusion.
  • output the AI as soon as available
  * add dialogue to chat with ai
* features
  * Customer Page Extension: Essentially creating lightweight support tool. I want to see customer "healthiness" status. It can be based on Jira bugs (Draft: New issue, Blocked: Noop, others: In-progress). There is already prepration for custom JQLs in Settings. Propose solution and LLM integration for summary. Dont do anything just yet, propose a solution
  * WorkItem integration with Aha! Feture
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* code readability, organization, DRY and overall architecture
  * update doc structure. it sometimes has paragraphs in wrong places. Also does not have a good logical hierarchy going from high level tree structure to individiual areas and eventually details
* security
