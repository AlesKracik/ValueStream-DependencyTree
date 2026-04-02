import React from 'react';
import { SETTINGS_SCOPE, resolveScope } from '@valuestream/shared-types';

/** Small inline icon that shows whether a settings path is server- or client-scoped.
 *  Only renders at "points of change": top-level keys, or children that override their parent's scope. */
export const ScopeIndicator: React.FC<{ path: string }> = ({ path }) => {
  if (!(path in SETTINGS_SCOPE)) return null;

  const scope = SETTINGS_SCOPE[path];

  // For non-root paths, only show if scope differs from parent
  const lastDot = path.lastIndexOf('.');
  if (lastDot !== -1) {
    const parentPath = path.substring(0, lastDot);
    if (resolveScope(parentPath) === scope) return null;
  }
  const isServer = scope === 'server';

  const title = isServer ? 'Stored on server' : 'Stored on client';

  // Server: simple rack/server icon — Client: monitor icon
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '4px', opacity: 0.55, verticalAlign: 'middle' }}>
      {isServer ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="1" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="2" y="10" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="5" cy="3.5" r="0.8" fill="currentColor" />
          <circle cx="5" cy="12.5" r="0.8" fill="currentColor" />
          <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1.5" y="1.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <line x1="5.5" y1="13.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="8" y1="10.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )}
    </span>
  );
};
