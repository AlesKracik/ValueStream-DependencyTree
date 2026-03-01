# 📖 User Guide & Value Stream Concepts

### 1. The Interactive Dashboard
![Dashboard View](./images/dashboard.png)
... (rest of section unchanged)

### 2. Customer TCV Visualization
Customers are represented by dual-layer additive circles:
- **Inner Circle (Solid Blue):** Represents **Existing TCV** (realized value).
- **Outer Ring (Dashed Blue):** Represents **Total TCV** (Existing + Potential). 
- **The Gap:** The distance between the solid core and the dashed ring visually represents the "Potential Upside" still available for that customer.
- **Proportional Scaling:** Circle diameters are strictly proportional to the global maximum TCV, making it easy to spot your most valuable accounts at a glance.
- **Focus Effects:** All input fields provide a subtle blue glow when focused, ensuring you always know which field you are currently editing.

### 3. Customer & Work Item Detail Pages
Both Customers and Work Items feature tabbed detail pages for better organization:

#### Customer Detail Page
![Customer Detail](./images/customer-detail.png)
- **Customer Details Section:** Displays basic info like Name, Actual TCV, and Potential TCV.
- **Updating Actual TCV:** The "Actual Existing TCV" value is protected. To change it, click **"Update TCV"**. This triggers a lifecycle process:
    1. The current value and its "Valid From" date are moved into the history.
    2. You enter a new value and a new date from which it becomes the "Actual" state.
- **Tabs:**
    - **Targeted Work Items:** View and manage which strategic initiatives are delivering value to this customer.
    - **TCV History:** A chronological audit trail of the customer's contract evolution. Historical entries are created automatically whenever you perform an "Update TCV" action.

#### Work Item Detail Page
![Work Item Detail](./images/workitem-detail.png)
- **Work Item Details Section:** Edit the name, total man-day estimates, and release target.
- **Tabs:**
    - **Targeted Customers:** Define which customers this initiative benefits. You can target either the **"Latest Actual"** TCV or a specific **historical record** from the customer's timeline.
    - **Epics:** Manage the execution units (Epics) assigned to engineering teams that fulfill this work item.

### 4. Work Item & Team Management
... (rest of guide unchanged)
