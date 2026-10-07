import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Issue, ValueStreamData } from '@valuestream/shared-types';
import { JiraLink } from '../common/JiraLink';
import { findJiraChildren, findJiraParent } from '../../utils/businessLogic';

interface Props {
  issue: Issue;
  data: ValueStreamData | null;
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
  // Global `button` rule is display:inline-flex; justify-content:center.
  justifyContent: 'flex-start',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '6px 8px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-secondary)',
  borderRadius: 4,
};

/**
 * Read-only Jira hierarchy of an issue. Jira owns it: `parent_jira_key` is
 * written by Jira sync only. Children are the issues whose parent is this one.
 */
export const IssueHierarchyTab: React.FC<Props> = ({ issue, data }) => {
  const navigate = useNavigate();
  const issues = data?.issues ?? [];
  const baseUrl = data?.settings?.jira?.base_url;

  const parentKey = issue.parent_jira_key;
  const parent = findJiraParent(issue, issues);
  const children = findJiraChildren(issue, issues);

  const renderIssue = (target: Issue) => (
    <>
      <button
        type="button"
        style={{ ...linkButtonStyle, flex: 1 }}
        onClick={() => navigate(`/issue/${target.id}`)}
        title="Open issue"
      >
        {target.name || target.jira_key}
      </button>
      <JiraLink issueKey={target.jira_key} baseUrl={baseUrl} directUrl={target.external_url} variant="pill" />
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section style={sectionStyle}>
        <h3 style={headingStyle}>Parent</h3>
        {parent ? (
          <div style={{ ...rowStyle, maxWidth: 640 }}>{renderIssue(parent)}</div>
        ) : parentKey ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <JiraLink issueKey={parentKey} baseUrl={baseUrl} variant="pill" />
            <span style={helperStyle}>Not imported.</span>
          </div>
        ) : (
          <div>No parent.</div>
        )}
        <div style={helperStyle}>Managed in Jira: sync the issue to refresh its parent.</div>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Children ({children.length})</h3>
        {children.length === 0 ? (
          <div style={helperStyle}>No imported children.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {children.map(c => (
              <li key={c.id} style={rowStyle}>{renderIssue(c)}</li>
            ))}
          </ul>
        )}
        <div style={helperStyle}>Imported issues whose Jira parent is this issue.</div>
      </section>
    </div>
  );
};
