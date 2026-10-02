/**
 * The model's `run` scenarios (specs/entities.qnt, EX-001..EX-018), each
 * driven through the conformance adapter against the real routes and a real
 * MongoDB, with the run's `.expect(...)` asserted on the abstract state and
 * every invariant checked after each step.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient } from 'mongodb';
import { EntitiesAdapter } from './adapter';
import { INVARIANTS, assertInvariants } from './invariants';

const MONGO_URI = process.env.CONFORMANCE_MONGO_URI ?? 'mongodb://127.0.0.1:27018';
const EDITOR = 'editor', VIEWER = 'viewer', NONE = '';

describe('entities model runs', () => {
  let client: MongoClient;
  let a: EntitiesAdapter;
  let steps = 0;

  /** Runs one step and checks every invariant after it. */
  const step = async (f: () => Promise<unknown>) => {
    await f();
    steps += 1;
    assertInvariants(await a.st(), await a.last(), `step ${steps}`);
  };

  beforeAll(async () => {
    client = await MongoClient.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    a = new EntitiesAdapter(client.db('entities_scenarios'));
    await a.start();
  });
  afterAll(async () => {
    await a?.stop();
    await client?.close();
  });
  beforeEach(async () => {
    steps = 0;
    await a.reset();
  });

  // EX-001
  it('insertThenReplace', async () => {
    await step(() => a.upsert_plain(EDITOR, 'customers', 'a', 0, true));
    await step(() => a.patch_doc(EDITOR, 'customers', 'a', 0, false, NONE, true));
    await step(() => a.upsert_plain(EDITOR, 'customers', 'a', 1, true));
    expect((await a.st()).version.customers.a).toBe(2);
  });

  // EX-016
  it('createNeverOverwrites', async () => {
    await step(() => a.upsert_plain(EDITOR, 'customers', 'a', 0, true));
    await step(() => a.upsert_plain(EDITOR, 'customers', 'a', 0, true));
    expect((await a.last()).result).toBe('Conflict');
    expect((await a.st()).version.customers.a).toBe(0);
  });

  // EX-002
  it('staleVersionConflicts', async () => {
    await step(() => a.upsert_plain(EDITOR, 'teams', 'a', 0, true));
    await step(() => a.patch_doc(EDITOR, 'teams', 'a', 0, false, NONE, true));
    await step(() => a.patch_doc(EDITOR, 'teams', 'a', 0, false, NONE, true));
    expect((await a.last()).result).toBe('Conflict');
  });

  // EX-003
  it('cycleRejected', async () => {
    await step(() => a.upsert_work_item(EDITOR, 'a', 0, NONE, [], true));
    await step(() => a.upsert_work_item(EDITOR, 'b', 0, 'a', [], true));
    await step(() => a.patch_doc(EDITOR, 'workItems', 'a', 0, true, 'b', true));
    expect((await a.last()).result).toBe('BadCycle');
  });

  // EX-004
  it('deleteDetachesChildren', async () => {
    await step(() => a.upsert_work_item(EDITOR, 'a', 0, NONE, [], true));
    await step(() => a.upsert_work_item(EDITOR, 'b', 0, 'a', [], true));
    await step(() => a.delete_doc(EDITOR, 'workItems', 'a', 0));
    expect((await a.st()).parent.b).toBe(NONE);
  });

  // EX-014
  it('customerDeleteBumpsTargets', async () => {
    await step(() => a.upsert_plain(EDITOR, 'customers', 'a', 0, true));
    await step(() => a.upsert_work_item(EDITOR, 'b', 0, NONE, ['a'], true));
    await step(() => a.delete_doc(EDITOR, 'customers', 'a', 0));
    const st = await a.st();
    expect(st.version.workItems.b).toBe(1);
    expect((await a.last()).cascaded).toBe(1);
    expect(st.targets.b).not.toContain('a');
  });

  // EX-017
  it('missingParentRejected', async () => {
    await step(() => a.upsert_work_item(EDITOR, 'a', 0, 'b', [], true));
    expect((await a.last()).result).toBe('BadMissingParent');
    expect((await a.st()).version.workItems).not.toHaveProperty('a');
  });

  // EX-018
  it('staleDeleteConflicts', async () => {
    await step(() => a.upsert_plain(EDITOR, 'teams', 'a', 0, true));
    await step(() => a.patch_doc(EDITOR, 'teams', 'a', 0, false, NONE, true));
    await step(() => a.delete_doc(EDITOR, 'teams', 'a', 0));
    expect((await a.last()).result).toBe('Conflict');
    expect((await a.st()).version.teams).toHaveProperty('a');
  });

  // EX-015
  it('viewerCannotSave', async () => {
    await step(() => a.upsert_plain(VIEWER, 'customers', 'a', 0, true));
    const last = await a.last();
    expect(last.result).toBe('ForbiddenRole');
    expect(last.changed).toBe(false);
  });
});

// Self-test: each invariant helper can actually reject a violating state.
describe('invariant helpers reject violations', () => {
  const ok = (): Parameters<typeof assertInvariants>[0] => ({
    version: { customers: {}, workItems: { a: 0, b: 0 }, teams: {}, issues: {}, sprints: {}, valueStreams: {}, unlisted: {} },
    parent: { a: '', b: 'a', c: '' }, targets: { a: [], b: [], c: [] },
    issueWorkItem: { a: '', b: '', c: '' }, issueTeam: { a: '', b: '', c: '' },
    supportIssues: { a: [], b: [], c: [] },
    createdAt: { a: 0, b: 1, c: -1 }, updatedAt: { a: 0, b: 1, c: -1 },
    clock: 2, recomputePending: false,
  });
  const okLast = (): Parameters<typeof assertInvariants>[1] => ({
    result: 'Ok', op: 'Insert', coll: 'workItems', id: 'b', role: 'editor', changed: true, triggered: true, cascaded: 0,
  });

  it('accepts a valid state', () => {
    for (const inv of Object.values(INVARIANTS)) expect(inv(ok(), okLast())).toBe(true);
  });

  const cases: [string, () => [ReturnType<typeof ok>, ReturnType<typeof okLast>]][] = [
    ['acyclicHierarchy', () => { const s = ok(); s.parent.a = 'b'; return [s, okLast()]; }],
    ['refusalChangesNothing', () => [ok(), { ...okLast(), result: 'Conflict' }]],
    ['recomputeOnlyForScoreCollections', () => [ok(), { ...okLast(), coll: 'teams' }]],
    ['createdNotAfterUpdated', () => { const s = ok(); s.createdAt.b = 5; return [s, okLast()]; }],
    ['versionsNonNegative', () => { const s = ok(); s.version.workItems.a = -1; return [s, okLast()]; }],
    ['onlyAllowedCollections', () => { const s = ok(); s.version.unlisted = { a: 0 }; return [s, okLast()]; }],
    ['viewersNeverWrite', () => [ok(), { ...okLast(), role: 'viewer' }]],
    ['parentsExist', () => { const s = ok(); s.parent.b = 'c'; return [s, okLast()]; }],
  ];
  for (const [name, make] of cases) {
    it(`${name} rejects its violation`, () => {
      const [s, l] = make();
      expect(INVARIANTS[name](s, l)).toBe(false);
    });
  }
});
