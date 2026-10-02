/**
 * The entities model's invariants (INV-001..INV-008, specs/entities.qnt),
 * stated over the adapter's abstract state so they can be asserted against
 * the real system after every replayed step.
 */
import type { AbstractState, AbstractLast } from './adapter';
import { COLLS, IDS } from './adapter';

const NONE = '';
const SCORE_AFFECTING = ['customers', 'workItems', 'issues'];

type Inv = (st: AbstractState, last: AbstractLast) => boolean;

/** Every ancestor of x via `parent` (x itself only if it sits on a cycle). */
function ancestorsOf(parent: Record<string, string>, x: string): Set<string> {
  const out = new Set<string>();
  let frontier = [x];
  for (let i = 0; i < IDS.length; i++) {
    frontier = frontier.map(y => parent[y]).filter(y => y !== undefined && y !== NONE && !out.has(y));
    frontier.forEach(y => out.add(y));
  }
  return out;
}

export const INVARIANTS: Record<string, Inv> = {
  // INV-001
  acyclicHierarchy: st => IDS.every(x => !ancestorsOf(st.parent, x).has(x)),
  // INV-002
  refusalChangesNothing: (_st, last) => last.result === 'Ok' || (!last.changed && !last.triggered),
  // INV-003
  recomputeOnlyForScoreCollections: (_st, last) => !last.triggered || SCORE_AFFECTING.includes(last.coll),
  // INV-004
  createdNotAfterUpdated: st => IDS.every(x => st.createdAt[x] < 0 || st.createdAt[x] <= st.updatedAt[x]),
  // INV-005
  versionsNonNegative: st => COLLS.every(c => Object.values(st.version[c] ?? {}).every(v => v >= 0)),
  // INV-006
  onlyAllowedCollections: st => Object.keys(st.version.unlisted ?? {}).length === 0,
  // INV-007
  viewersNeverWrite: (_st, last) => !last.changed || last.role === 'editor',
  // INV-008
  parentsExist: st => Object.keys(st.version.workItems ?? {}).every(w =>
    (st.parent[w] ?? NONE) === NONE || st.parent[w] in (st.version.workItems ?? {})),
};

/** Throws naming every invariant the state violates. */
export function assertInvariants(st: AbstractState, last: AbstractLast, where: string): void {
  const broken = Object.entries(INVARIANTS).filter(([, inv]) => !inv(st, last)).map(([name]) => name);
  if (broken.length > 0) throw new Error(`${where}: invariant(s) violated: ${broken.join(', ')}`);
}
