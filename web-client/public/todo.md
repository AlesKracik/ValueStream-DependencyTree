* bugs
* features
  * WorkItem integration with Aha! Feature
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* code readability, organization, DRY and overall architecture
  * update doc structure. it sometimes has paragraphs in wrong places. Also does not have a good logical hierarchy going from high level tree structure to individiual areas and eventually details
  * refactor API to be more granular, well structured and use case isolated
  * lot of updates and computations are done "on fetch/display" - move the reasonable ones to BE. what will trigger them?
  * split settings on FE and BE related to manage the updates properly
* security
