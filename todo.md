* bugs
* features
  • if there is jira associated with workitem that is in progress, move the WI status to development. if all jiras are done, move WI to done
  • add releases
  • filter entities based on more properties e.g status, TCV etc.
  • snowflake integration
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* code readability, organization, DRY and overall architecture
  * update doc structure. it sometimes has paragraphs in wrong places. Also does not have a good logical hierarchy going from high level tree structure to individiual areas and eventually details
  * split settings on FE and BE related to manage the updates properly
* security
