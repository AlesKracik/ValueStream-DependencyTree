# Teams (Supply Layer)

## Overview
Teams represent the engineering resources available to execute on strategic initiatives. They act as the "Who" and the primary constraint in the value stream.

## Data Model
```typescript
export interface Team {
  id: string;
  name: string;
  total_capacity_mds: number; // Base man-days per sprint
  country?: string;           // For holiday calculation (ISO code)
  sprint_capacity_overrides?: Record<string, number>;
}
```

## Capacity Logic
The system calculates available capacity for each team per sprint:
1. **Base Capacity:** `total_capacity_mds`.
2. **Refined Holiday Impact:** Automatic reduction of capacity (10% per **public holiday** that falls on a weekday) using the `date-holidays` library based on the team's `country`. Observances or religious holidays that are not public days off are excluded.
3. **Overrides:** Sprint-specific capacity adjustments manually set by users.
   - **Visual Feedback:** Active overrides are highlighted in blue in the Team Detail page.
   - **Quick Clear:** Users can click the "×" button to revert to the calculated capacity.

## Team Management
- **Add Team:** New teams can be created from the Team List page.
- **Delete Team:** Teams can be deleted from their detail page (includes a confirmation dialog and automatic clearing of team assignments for affected issues).

## Visual Representation
- **Node Type:** `TeamNode`.
- **Scaling:** Size scales based on `total_capacity_mds`.
- **Pivot Point:** In the layout, Team nodes serve as the vertical anchors for their respective Gantt swimlanes.

## Relationships
- **Issues:** Teams are assigned to Issues. Multiple Issues for the same team in the same sprint will vertically stack within the team's swimlane.

```mermaid
graph TD
    Team[Team Node] -->|Anchor| Lane[Gantt Swimlane]
    Issue1[Issue A] --> Lane
    Issue2[Issue B] --> Lane
    Capacity[Sprint Capacity Marker] -->|Status| Lane
```

## Logic
- **Utilization:** The capacity marker (above the Gantt lane) turns red if the sum of effort from all Issues assigned to that team in a given sprint exceeds the calculated available capacity.
