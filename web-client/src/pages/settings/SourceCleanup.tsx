import { useMemo, useState } from "react";
import { useNotificationContext } from "../../contexts/NotificationContext";
import { planSourceCleanup, type CleanupCandidate } from "../../utils/sourceCleanup";

interface SourceCleanupProps {
  /** Source shown in the copy, e.g. "Aha!" or "Jira". */
  sourceName: string;
  /** Plural noun for the records, e.g. "work items" or "issues". */
  noun: string;
  candidates: CleanupCandidate[];
  onDelete: (id: string) => void;
  disabled?: boolean;
}

const PREVIEW_LIMIT = 50;

/**
 * "Clean up" subsection: deletes records imported from a source that the
 * source has not updated for a chosen number of days. Records something
 * still links to are skipped unless "Include linked" is checked.
 */
export const SourceCleanup: React.FC<SourceCleanupProps> = ({ sourceName, noun, candidates, onDelete, disabled }) => {
  const { showConfirm } = useNotificationContext();
  const [days, setDays] = useState("180");
  const [includeLinked, setIncludeLinked] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const olderThanDays = days.trim() === "" ? NaN : Number(days);
  const plan = useMemo(
    () => planSourceCleanup(candidates, olderThanDays, includeLinked),
    [candidates, olderThanDays, includeLinked]
  );
  const daysValid = Number.isFinite(olderThanDays) && olderThanDays >= 0;

  const handleCleanup = async () => {
    const targets = plan.toDelete;
    if (targets.length === 0) return;
    const confirmed = await showConfirm(
      `Clean up ${sourceName} ${noun}`,
      `Delete ${targets.length} ${noun} not updated in ${sourceName} for more than ${olderThanDays} days? This cannot be undone.`
    );
    if (!confirmed) return;
    targets.forEach(t => onDelete(t.id));
    setResult(`Deleted ${targets.length} ${noun}.`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <hr style={{ width: "100%", maxWidth: "32rem", border: "none", borderTop: "1px solid var(--border-primary)", margin: "0", alignSelf: "flex-start" }} />
      <h3 style={{ margin: 0, fontSize: "15px", color: "var(--text-primary)" }}>Clean up</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0, maxWidth: "32rem" }}>
        Delete {noun} imported from {sourceName} that {sourceName} has not updated recently. The date comes from {sourceName} and is stored on every import or sync.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
        Not updated in {sourceName} for more than (days):
        <input
          type="number"
          min={0}
          aria-label="Cleanup age in days"
          value={days}
          onChange={(e) => { setDays(e.target.value); setResult(null); }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
        <input
          type="checkbox"
          checked={includeLinked}
          onChange={(e) => { setIncludeLinked(e.target.checked); setResult(null); }}
          style={{ width: "auto" }}
        />
        Include linked {noun}
      </label>

      {daysValid && (
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "32rem" }}>
          <div>{plan.toDelete.length} {noun} will be deleted.</div>
          {plan.linked.length > 0 && <div>{plan.linked.length} stale but linked — skipped.</div>}
          {plan.undated.length > 0 && <div>{plan.undated.length} have no {sourceName} date yet — run a sync to include them.</div>}
          {plan.toDelete.length > 0 && (
            <details style={{ marginTop: "6px" }}>
              <summary style={{ cursor: "pointer" }}>Show {noun} to delete</summary>
              <ul style={{ margin: "6px 0 0 0", paddingLeft: "20px" }}>
                {plan.toDelete.slice(0, PREVIEW_LIMIT).map(c => (
                  <li key={c.id}>
                    {c.label}
                    {c.sourceUpdatedAt && <span style={{ color: "var(--text-muted)" }}> — {c.sourceUpdatedAt.slice(0, 10)}</span>}
                    {c.linkedReason && <span style={{ color: "var(--text-muted)" }}> ({c.linkedReason})</span>}
                  </li>
                ))}
                {plan.toDelete.length > PREVIEW_LIMIT && <li>…and {plan.toDelete.length - PREVIEW_LIMIT} more</li>}
              </ul>
            </details>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn-primary"
        onClick={handleCleanup}
        style={{ alignSelf: "flex-start" }}
        disabled={disabled || !daysValid || plan.toDelete.length === 0}
      >
        Delete {plan.toDelete.length} {noun}
      </button>

      {result && (
        <div
          style={{
            padding: "10px",
            borderRadius: "4px",
            fontSize: "14px",
            backgroundColor: "var(--status-success-bg)",
            color: "var(--status-success)",
            border: "1px solid var(--status-success)",
            maxWidth: "32rem",
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
};
