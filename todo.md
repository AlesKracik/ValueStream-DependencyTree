* bugs
* features
  • when moving gannt timeline, it does not adjust when some items fall completely out of the range, i.e. it leaves empty space
  * sort gannt based on related score
  • add releases
  • add some filtering allowing not to upload whole db for valuestream
  • add customerId to slack
  • get team members from ldap
  • snowflake integration
  * Multi-Provider Secret Management Strategy: Replace plain-text `settings.json` secrets with a secure `SecretManager` service.
    - **Local (Native)**: Use OS Keyring (via `node-keytar`) for Windows Credential Manager and macOS Keychain.
    - **Docker**: Bind-mount `settings.json` and the encrypted `settings.secrets.enc` to `./backend` for host-side visibility and persistence. Encrypted secrets use `ADMIN_SECRET` as the master key. Both files must be in `.gitignore`.
    - **Kubernetes**: Read from native K8s Secrets (env/volumes) and use the encrypted file for UI-driven persistence.
    - **UI**: Maintain full interactive functionality by transparently handling encryption/decryption during GET/POST of settings.
  * TCV History Logic Enhancement: Currently, when a Customer's Actual TCV is updated (archived to history), Work Items linked to "Latest Actual" remain linked to the new "Latest Actual". Consider if some Work Items should be automatically re-linked to the archived historical entry to preserve their context.
* code readability, organization, DRY and overall architecture
  * update doc structure. it sometimes has paragraphs in wrong places. Also does not have a good logical hierarchy going from high level tree structure to individiual areas and eventually details
  * the filters are still applied after the "500" limit check - it should be the orther way round, but thats blocked by the calculations.
  * lot of updates and computations are done "on fetch/display" - move the reasonable ones to BE. what will trigger them?
  * split settings on FE and BE related to manage the updates properly
* security
