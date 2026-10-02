/**
 * Conformance adapter: specs/entities.qnt  <->  the real entity routes.
 *
 * One method per Quint action, one getter per Quint var (`st`, `last`), and
 * reset() to the model's `init`. The adapter drives the real Fastify app over
 * a real MongoDB; it stubs only what the model abstracts away:
 *   - identity: `checkAuth` yields a user with the step's role, so
 *     `requireRole` runs for real;
 *   - the DB connection: `getDb` returns the conformance database;
 *   - score recomputation is not run inline — the model treats it as a
 *     scheduled job (`recomputePending`) that `recompute_scores` runs.
 *
 * Abstraction mapping (model -> code), each named:
 *   - Id / Coll        : document id / collection name, verbatim.
 *   - NONE ("")        : an absent or empty reference field.
 *   - version          : `_version`, a legacy doc without one reads as 0.
 *   - ElemId           : the server assigns element UUIDs (DEC-011); the
 *                        adapter records uuid -> model element id on add.
 *   - createdAt/updatedAt : the model's logical clock value of the write that
 *                        stamped the ISO timestamp; -1 when absent.
 *   - clock            : the number of accepted writes so far.
 *   - last.result      : HTTP status + error message -> Result variant.
 *   - last.op          : the request kind; an upsert is Insert when it created
 *                        the document (or was a create that conflicted).
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Db } from 'mongodb';
import { vi } from 'vitest';
import { buildApp } from '../app';
import * as mongoServer from '../utils/mongoServer';
import * as authServer from '../utils/authServer';
import * as metricsService from '../services/metricsService';

export const COLLS = ['customers', 'workItems', 'teams', 'issues', 'sprints', 'valueStreams', 'unlisted'] as const;
export const IDS = ['a', 'b', 'c'] as const;
const NONE = '';

export type Result =
  | 'Idle' | 'Ok' | 'Conflict' | 'NotFound' | 'ForbiddenRole' | 'ForbiddenCollection'
  | 'BadCycle' | 'BadServerOwned' | 'BadArrayPath' | 'BadElementKey' | 'BadVersionParam'
  | 'BadMissingParent' | 'BadStatus';
export type Op = 'OpNone' | 'Insert' | 'Replace' | 'Patch' | 'Delete' | 'AddElem' | 'PatchElem' | 'DeleteElem' | 'Recompute';

export interface AbstractState {
  version: Record<string, Record<string, number>>;
  parent: Record<string, string>;
  targets: Record<string, string[]>;
  issueWorkItem: Record<string, string>;
  issueTeam: Record<string, string>;
  supportIssues: Record<string, string[]>;
  createdAt: Record<string, number>;
  updatedAt: Record<string, number>;
  clock: number;
  recomputePending: boolean;
}

export interface AbstractLast {
  result: Result; op: Op; coll: string; id: string; role: string;
  changed: boolean; triggered: boolean; cascaded: number;
}

type Doc = Record<string, unknown>;

/** HTTP response -> the model's Result variant. */
function toResult(res: LightMyRequestResponse): Result {
  if (res.statusCode === 200) return 'Ok';
  if (res.statusCode === 409) return 'Conflict';
  if (res.statusCode === 404) return 'NotFound';
  const error = String((res.json() as { error?: string }).error ?? '');
  if (res.statusCode === 403) return error === 'Forbidden collection' ? 'ForbiddenCollection' : 'ForbiddenRole';
  if (res.statusCode === 400) {
    if (/cycle/.test(error)) return 'BadCycle';
    if (/server-owned/.test(error)) return 'BadServerOwned';
    if (/not editable element-wise/.test(error)) return 'BadArrayPath';
    if (/Cannot patch the element's/.test(error)) return 'BadElementKey';
    if (/Invalid _version query parameter/.test(error)) return 'BadVersionParam';
    if (/does not name an existing work item/.test(error)) return 'BadMissingParent';
    if (/^Invalid (support_issues\.)?status/.test(error)) return 'BadStatus';
  }
  throw new Error(`unmapped response ${res.statusCode}: ${res.payload}`);
}

export class EntitiesAdapter {
  private app!: FastifyInstance;
  private clock = 0;
  private recomputePending = false;
  private triggeredThisStep = false;
  private lastSeen: AbstractLast = idleLast();
  /** server element uuid -> model ElemId */
  private elemOf = new Map<string, string>();
  /** ISO timestamp -> logical clock value of the write that stamped it */
  private tickOf = new Map<string, number>();
  private readonly realRecompute = metricsService.recomputeScoresForWorkItems;

  constructor(private readonly db: Db) {}

  async start(): Promise<void> {
    vi.spyOn(mongoServer, 'getDb').mockResolvedValue(this.db);
    vi.spyOn(authServer, 'checkAuth').mockImplementation((_url, headers) => {
      const role = String(headers['x-conformance-role'] ?? 'editor') as 'viewer' | 'editor';
      return { authorized: true, user: { userId: role, username: role, role, isAdmin: false } };
    });
    vi.spyOn(metricsService, 'recomputeScoresForWorkItems').mockImplementation(async () => {
      this.recomputePending = true;
      this.triggeredThisStep = true;
    });
    this.app = await buildApp();
    this.app.getSettings = vi.fn().mockResolvedValue({ persistence: { mongo: { app: { uri: 'mongodb://conformance' } } } });
    await this.app.ready();
  }

  async stop(): Promise<void> {
    await this.app.close();
    vi.restoreAllMocks();
  }

  /** The model's `init`: empty store plus "c", a legacy work item with no
   *  `_version` and no timestamps. */
  async reset(): Promise<void> {
    await this.db.dropDatabase();
    await this.db.collection('workItems').insertOne({ id: 'c', name: 'legacy' });
    this.clock = 0;
    this.recomputePending = false;
    this.lastSeen = idleLast();
    this.elemOf.clear();
    this.tickOf.clear();
  }

  // ── actions ────────────────────────────────────────────────────────────

  async upsert_plain(role: string, c: string, id: string, v: number, okStatus: boolean) {
    const body: Doc = { id, _version: v, name: `${c}-${id}` };
    if (c === 'customers' && !okStatus) body.support_issues = [{ id: 'bad', description: 'x', status: 'bogus' }];
    const res = await this.send(role, 'POST', `/api/entity/${c}/${id}`, body);
    return this.record(res, role, upsertOp(res, v), c, id);
  }

  async upsert_work_item(role: string, id: string, v: number, p: string, ts: string[], okStatus: boolean) {
    const body: Doc = {
      id, _version: v, name: `wi-${id}`,
      parent_id: p,
      customer_targets: ts.map(cid => ({ customer_id: cid, tcv_type: 'existing', priority: 'Must-have' })),
      status: okStatus ? 'Backlog' : 'Bogus',
    };
    const res = await this.send(role, 'POST', `/api/entity/workItems/${id}`, body);
    return this.record(res, role, upsertOp(res, v), 'workItems', id);
  }

  async upsert_issue(role: string, id: string, v: number, wi: string, team: string) {
    const body: Doc = { id, _version: v, name: `issue-${id}`, work_item_id: wi, team_id: team, effort_md: 1 };
    const res = await this.send(role, 'POST', `/api/entity/issues/${id}`, body);
    return this.record(res, role, upsertOp(res, v), 'issues', id);
  }

  async patch_doc(role: string, c: string, id: string, v: number, touchParent: boolean, p: string, okStatus: boolean) {
    const patch: Doc = { name: `patched-${id}` };
    if (c === 'workItems') {
      patch.status = okStatus ? 'Planning' : 'Bogus';
      if (touchParent) patch.parent_id = p;
    }
    if (c === 'customers' && !okStatus) patch.support_issues = [{ id: 'bad', description: 'x', status: 'bogus' }];
    const res = await this.send(role, 'PATCH', `/api/entity/${c}/${id}`, { _version: v, patch });
    return this.record(res, role, 'Patch', c, id);
  }

  async patch_server_owned(role: string, c: string, id: string) {
    const res = await this.send(role, 'PATCH', `/api/entity/${c}/${id}`, { _version: 0, patch: { calculated_tcv: 1 } });
    return this.record(res, role, 'Patch', c, id);
  }

  async delete_doc(role: string, c: string, id: string, v: number) {
    const res = await this.send(role, 'DELETE', `/api/entity/${c}/${id}?_version=${v}`);
    const cascaded = res.statusCode === 200
      ? Object.values((res.json() as { cascaded?: Record<string, number> }).cascaded ?? {}).reduce((a, b) => a + b, 0)
      : 0;
    return this.record(res, role, 'Delete', c, id, cascaded);
  }

  async add_element(role: string, id: string, v: number, e: string, whitelisted: boolean, okStatus: boolean) {
    const arrayPath = whitelisted ? 'support_issues' : 'jira_support_issues';
    const item = { description: `elem-${e}`, status: okStatus ? 'to do' : 'bogus' };
    const res = await this.send(role, 'POST', `/api/entity/customers/${id}/items/${arrayPath}`, { _version: v, item });
    if (res.statusCode === 200) this.elemOf.set((res.json() as { item: { id: string } }).item.id, e);
    return this.record(res, role, 'AddElem', 'customers', id);
  }

  async patch_element(role: string, id: string, v: number, e: string, touchesKey: boolean, okStatus: boolean) {
    const patch: Doc = { description: `edited-${e}`, status: okStatus ? 'done' : 'bogus' };
    if (touchesKey) patch.id = 'renamed';
    const res = await this.send(role, 'PATCH', `/api/entity/customers/${id}/items/support_issues/${this.uuidOf(e)}`, { _version: v, patch });
    return this.record(res, role, 'PatchElem', 'customers', id);
  }

  async delete_element(role: string, id: string, v: number, e: string) {
    const res = await this.send(role, 'DELETE', `/api/entity/customers/${id}/items/support_issues/${this.uuidOf(e)}?_version=${v}`);
    return this.record(res, role, 'DeleteElem', 'customers', id);
  }

  /** The scheduled recomputation runs (REQ-027, REQ-032). */
  async recompute_scores() {
    await this.realRecompute(this.db);
    this.recomputePending = false;
    this.lastSeen = { result: 'Idle', op: 'Recompute', coll: 'workItems', id: NONE, role: this.lastSeen.role,
      changed: false, triggered: false, cascaded: 0 };
  }

  // ── getters (one per Quint var) ────────────────────────────────────────

  async st(): Promise<AbstractState> {
    const all: Record<string, Doc[]> = {};
    for (const c of COLLS) all[c] = await this.db.collection(c).find({}, { projection: { _id: 0 } }).toArray();
    const byId = (c: string) => new Map(all[c].map(d => [String(d.id), d]));
    const wi = byId('workItems'), iss = byId('issues'), cust = byId('customers');
    const ref = (x: unknown) => (typeof x === 'string' ? x : NONE);
    const perId = <T>(f: (id: string) => T) => Object.fromEntries(IDS.map(id => [id, f(id)]));
    const tick = (iso: unknown) => (typeof iso === 'string' ? this.tickOf.get(iso) ?? -2 : -1);

    return {
      version: Object.fromEntries(COLLS.map(c => [c,
        Object.fromEntries(all[c].map(d => [String(d.id), typeof d._version === 'number' ? d._version : 0]))])),
      parent: perId(id => ref(wi.get(id)?.parent_id)),
      targets: perId(id => ((wi.get(id)?.customer_targets as { customer_id: string }[] | undefined) ?? [])
        .map(t => t.customer_id).sort()),
      issueWorkItem: perId(id => ref(iss.get(id)?.work_item_id)),
      issueTeam: perId(id => ref(iss.get(id)?.team_id)),
      supportIssues: perId(id => ((cust.get(id)?.support_issues as { id: string }[] | undefined) ?? [])
        .map(s => this.elemOf.get(s.id) ?? `unmapped:${s.id}`).sort()),
      createdAt: perId(id => tick(wi.get(id)?.created_at)),
      updatedAt: perId(id => tick(wi.get(id)?.updated_at)),
      clock: this.clock,
      recomputePending: this.recomputePending,
    };
  }

  async last(): Promise<AbstractLast> {
    return this.lastSeen;
  }

  // ── plumbing ───────────────────────────────────────────────────────────

  private uuidOf(e: string): string {
    for (const [uuid, elem] of this.elemOf) if (elem === e) return uuid;
    return `absent-${e}`;
  }

  private async send(role: string, method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Doc) {
    this.triggeredThisStep = false;
    // Distinct timestamps per request, so each maps to one logical tick.
    await new Promise(r => setTimeout(r, 2));
    return this.app.inject({ method, url, payload, headers: { 'x-conformance-role': role } });
  }

  private async record(res: LightMyRequestResponse, role: string, op: Op, c: string, id: string, cascaded = 0) {
    const result = toResult(res);
    if (result === 'Ok') {
      // Every ISO stamp this write introduced belongs to the current tick.
      for (const d of await this.db.collection('workItems').find({}).toArray()) {
        for (const iso of [d.created_at, d.updated_at]) {
          if (typeof iso === 'string' && !this.tickOf.has(iso)) this.tickOf.set(iso, this.clock);
        }
      }
      this.clock += 1;
    }
    this.lastSeen = {
      result, op, coll: c, id, role,
      changed: result === 'Ok',
      triggered: this.triggeredThisStep,
      cascaded,
    };
    return this.lastSeen;
  }
}

function idleLast(): AbstractLast {
  return { result: 'Idle', op: 'OpNone', coll: 'unlisted', id: NONE, role: 'editor',
    changed: false, triggered: false, cascaded: 0 };
}

/** An upsert is an Insert when it created the document, or when it was a
 *  create (version 0) that collided with an existing one. */
function upsertOp(res: LightMyRequestResponse, v: number): Op {
  if (res.statusCode === 200) return (res.json() as { _version: number })._version === 0 ? 'Insert' : 'Replace';
  if (res.statusCode === 409 && v === 0) return 'Insert';
  return 'Replace';
}
