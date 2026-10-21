/** One item an import or sync could not process. */
export interface SyncFailure {
  /** What failed, as the user knows it (Jira key, Aha! reference, customer name). */
  key: string;
  error: string;
}

/** Records an item failure: the error message, or a fallback when the error carries none. */
export const failureOf = (key: string, err: unknown, fallback = "Unknown error"): SyncFailure => ({
  key,
  error: err instanceof Error && err.message ? err.message : (typeof err === "string" && err ? err : fallback),
});

/** Most keys listed under one error; the rest are counted. */
export const MAX_KEYS_PER_ERROR = 100;
export interface FailureGroup {
  error: string;
  keys: string[];
}

/** Groups failures by error message, largest group first. */
export const groupFailures = (failures: SyncFailure[]): FailureGroup[] => {
  const byError = new Map<string, string[]>();
  for (const f of failures) {
    const keys = byError.get(f.error);
    if (keys) keys.push(f.key);
    else byError.set(f.error, [f.key]);
  }
  return [...byError.entries()]
    .map(([error, keys]) => ({ error, keys }))
    .sort((a, b) => b.keys.length - a.keys.length);
};
