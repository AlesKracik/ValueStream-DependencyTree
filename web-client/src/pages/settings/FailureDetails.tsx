import { useMemo, useState } from "react";
import { groupFailures, MAX_KEYS_PER_ERROR, type SyncFailure } from "../../utils/syncFailures";

/** Above this many failed items the filter box is shown. */
const FILTER_THRESHOLD = 20;

/**
 * The failed items of an import or sync, grouped by error. Each group is
 * collapsed by default and lists at most MAX_KEYS_PER_ERROR keys.
 */
export const FailureDetails: React.FC<{ failures?: SyncFailure[] }> = ({ failures }) => {
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const groups = useMemo(() => groupFailures(failures || []), [failures]);

  if (!failures || failures.length === 0) return null;

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? groups
        .map(g => g.error.toLowerCase().includes(needle) ? g : { ...g, keys: g.keys.filter(k => k.toLowerCase().includes(needle)) })
        .filter(g => g.keys.length > 0)
    : groups;

  const copyAll = async () => {
    const text = groups.map(g => `${g.error} (${g.keys.length})\n${g.keys.join(", ")}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err: unknown) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "var(--text-secondary)", marginTop: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <strong>{failures.length} failed</strong>
        <span style={{ color: "var(--text-muted)" }}>
          ({groups.length} {groups.length === 1 ? "error" : "distinct errors"})
        </span>
        {failures.length > FILTER_THRESHOLD && (
          <input
            type="search"
            aria-label="Filter failures"
            placeholder="Filter by key or error"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: "14rem", fontSize: "13px" }}
          />
        )}
        <button type="button" className="btn-secondary" onClick={copyAll} style={{ fontSize: "12px", padding: "2px 8px" }}>
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>

      {shown.map(g => {
        const listed = g.keys.slice(0, MAX_KEYS_PER_ERROR);
        const more = g.keys.length - listed.length;
        return (
          <details key={g.error} style={{ border: "1px solid var(--border-primary)", borderRadius: "4px", padding: "4px 8px" }}>
            <summary style={{ cursor: "pointer", overflowWrap: "anywhere" }}>
              {g.error} <span style={{ color: "var(--text-muted)" }}>×{g.keys.length}</span>
            </summary>
            <div style={{ marginTop: "4px", fontFamily: "monospace", overflowWrap: "anywhere", lineHeight: 1.5 }}>
              {listed.join(", ")}
              {more > 0 && <span style={{ color: "var(--text-muted)" }}> +{more} more</span>}
            </div>
          </details>
        );
      })}
      {shown.length === 0 && <span style={{ color: "var(--text-muted)" }}>No failures match the filter.</span>}
    </div>
  );
};
