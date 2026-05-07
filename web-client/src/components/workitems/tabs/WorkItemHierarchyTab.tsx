import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ValueStreamData, WorkItem } from '@valuestream/shared-types';
import { SearchableDropdown } from '../../common/SearchableDropdown';

interface Props {
  workItem: WorkItem | undefined;
  isNew: boolean;
  workItemId: string;
  data: ValueStreamData | null;
  setNewWorkItemDraft: React.Dispatch<React.SetStateAction<Partial<WorkItem>>>;
  updateWorkItem: (id: string, updates: Partial<WorkItem>, immediate?: boolean) => Promise<void>;
}

/**
 * Walks the parent chain starting from `startId` (exclusive) and returns the
 * set of ancestor IDs. Used to keep the picker free of cycle-inducing options.
 */
function collectAncestors(startId: string, workItems: WorkItem[]): Set<string> {
  const byId = new Map(workItems.map(w => [w.id, w]));
  const out = new Set<string>();
  let cursor = byId.get(startId)?.parent_id;
  while (cursor && !out.has(cursor)) {
    out.add(cursor);
    cursor = byId.get(cursor)?.parent_id;
  }
  return out;
}

/** BFS over `parent_id` edges to collect everything in the subtree rooted at `rootId`. */
function collectDescendants(rootId: string, workItems: WorkItem[]): Set<string> {
  const out = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const w of workItems) {
      if (w.parent_id === id && !out.has(w.id)) {
        out.add(w.id);
        queue.push(w.id);
      }
    }
  }
  return out;
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 4px 0',
  fontSize: 14,
  color: 'var(--text-primary)',
  fontWeight: 600,
};

const helperStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--accent-text)',
  cursor: 'pointer',
  padding: 0,
  fontSize: 14,
  textAlign: 'left',
};

export const WorkItemHierarchyTab: React.FC<Props> = ({
  workItem,
  isNew,
  workItemId,
  data,
  setNewWorkItemDraft,
  updateWorkItem,
}) => {
  const navigate = useNavigate();
  const allWorkItems = data?.workItems ?? [];

  if (!workItem) {
    return <div style={helperStyle}>Loading…</div>;
  }

  const currentId = isNew ? '__new__' : workItemId;
  const parentId = workItem.parent_id;
  const parent = parentId ? allWorkItems.find(w => w.id === parentId) : undefined;

  // Children only exist for persisted work items.
  const children = isNew ? [] : allWorkItems.filter(w => w.parent_id === currentId);

  // Sets used to keep picker options cycle-free.
  const descendantIds = isNew ? new Set<string>() : collectDescendants(currentId, allWorkItems);
  const ancestorIds = isNew ? new Set<string>() : collectAncestors(currentId, allWorkItems);

  const parentOptions = allWorkItems
    .filter(w => w.id !== currentId && !descendantIds.has(w.id))
    .map(w => ({ id: w.id, label: w.name }));

  const childOptions = allWorkItems
    .filter(w =>
      w.id !== currentId &&
      !descendantIds.has(w.id) &&
      !ancestorIds.has(w.id) &&
      w.parent_id !== currentId,
    )
    .map(w => ({ id: w.id, label: w.parent_id ? `${w.name} (currently child of ${allWorkItems.find(x => x.id === w.parent_id)?.name ?? '?'})` : w.name }));

  const setParent = (newParentId: string | undefined) => {
    if (isNew) {
      setNewWorkItemDraft(prev => ({ ...prev, parent_id: newParentId }));
    } else {
      updateWorkItem(currentId, { parent_id: newParentId }, true);
    }
  };

  const addChild = (childCandidateId: string) => {
    if (!childCandidateId || isNew) return;
    updateWorkItem(childCandidateId, { parent_id: currentId }, true);
  };

  const removeChild = (childId: string) => {
    updateWorkItem(childId, { parent_id: undefined }, true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Parent section */}
      <section style={sectionStyle}>
        <h3 style={headingStyle}>Parent</h3>
        {parent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              style={linkButtonStyle}
              onClick={() => navigate(`/workitem/${parent.id}`)}
              title="Open parent"
            >
              {parent.name}
            </button>
            <button
              type="button"
              onClick={() => setParent(undefined)}
              style={{
                background: 'var(--status-danger-bg)',
                color: 'var(--status-danger-text)',
                border: '1px solid var(--status-danger-border)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Remove parent
            </button>
          </div>
        ) : parentId && !isNew ? (
          <div style={helperStyle}>
            Parent <code>{parentId}</code> not found. <button type="button" style={{ ...linkButtonStyle, fontSize: 12 }} onClick={() => setParent(undefined)}>Clear</button>
          </div>
        ) : (
          <div style={{ maxWidth: 420 }}>
            <SearchableDropdown
              options={parentOptions}
              onSelect={(id) => id && setParent(id)}
              placeholder="Pick a parent work item…"
              clearOnSelect={false}
            />
            <div style={{ ...helperStyle, marginTop: 4 }}>
              Self and descendants are excluded to prevent cycles.
            </div>
          </div>
        )}
      </section>

      {/* Children section */}
      <section style={sectionStyle}>
        <h3 style={headingStyle}>Children ({children.length})</h3>
        {isNew ? (
          <div style={helperStyle}>Save this work item before adding children.</div>
        ) : (
          <>
            {children.length === 0 && (
              <div style={helperStyle}>No children.</div>
            )}
            {children.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {children.map(c => (
                  <li
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '6px 8px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-secondary)',
                      borderRadius: 4,
                    }}
                  >
                    <button
                      type="button"
                      style={{ ...linkButtonStyle, flex: 1 }}
                      onClick={() => navigate(`/workitem/${c.id}`)}
                    >
                      {c.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeChild(c.id)}
                      style={{
                        background: 'transparent',
                        color: 'var(--text-link)',
                        border: '1px solid var(--border-secondary)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      title="Detach this child"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ maxWidth: 420, marginTop: 4 }}>
              <SearchableDropdown
                options={childOptions}
                onSelect={addChild}
                placeholder="Add a child work item…"
                clearOnSelect
              />
              <div style={{ ...helperStyle, marginTop: 4 }}>
                Self, ancestors, descendants, and existing children are excluded.
                Adding a work item that already has a parent will move it under this one.
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
