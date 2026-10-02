/**
 * Witness-trace replay: every ITF trace the model checker produced for the
 * entities area is driven through the adapter against the real routes and a
 * real MongoDB, and after every step each Quint var (`st`, `last`) must equal
 * the trace's state under the adapter's abstraction.
 *
 * Traces: ./traces — copies of the model checker's witness traces, kept in
 * this repo so the suite has no dependency on the spec repo. Refresh them by
 * copying a new set in after a re-check of the model. $SPEC_TRACES_DIR
 * overrides the location.
 * MongoDB: $CONFORMANCE_MONGO_URI, default mongodb://127.0.0.1:27018 — see
 * run.sh, which starts a throwaway container.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import { EntitiesAdapter } from './adapter';
import { assertInvariants } from './invariants';

const TRACES_DIR = process.env.SPEC_TRACES_DIR ?? path.resolve(__dirname, 'traces');
const MONGO_URI = process.env.CONFORMANCE_MONGO_URI ?? 'mongodb://127.0.0.1:27018';

type Itf = { vars: string[]; states: Record<string, unknown>[] };

/** ITF value -> plain JSON: bigints to numbers, maps to objects, sets to
 *  sorted arrays, unit variants to their tag (mirrors itf_tools render_value). */
function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('#bigint' in o) return Number(o['#bigint']);
    if ('#map' in o) return Object.fromEntries((o['#map'] as [unknown, unknown][]).map(([k, x]) => [String(decode(k)), decode(x)]));
    if ('#set' in o) return (o['#set'] as unknown[]).map(decode).sort();
    if ('tag' in o && 'value' in o) {
      const inner = o.value as Record<string, unknown>;
      return inner && inner.tag === 'UNIT' ? o.tag : { tag: o.tag, value: decode(o.value) };
    }
    return Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('#')).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

/** Call arguments per action, in declaration order: from `mbt::nondetPicks`
 *  first (keyed by the model step's nondet names), else the probe ghosts. */
const PARAMS: Record<string, { ghosts: string[]; picks: string[] }> = {
  upsert_plain:       { ghosts: ['Role', 'C', 'Id', 'V', 'OkStatus'], picks: ['role', 'c', 'id', 'v', 'ok'] },
  upsert_work_item:   { ghosts: ['Role', 'Id', 'V', 'P', 'Ts', 'OkStatus'], picks: ['role', 'id', 'v', 'p', 'ts', 'ok'] },
  upsert_issue:       { ghosts: ['Role', 'Id', 'V', 'Wi', 'Team'], picks: ['role', 'id', 'v', 'ref', 'p'] },
  patch_doc:          { ghosts: ['Role', 'C', 'Id', 'V', 'TouchParent', 'P', 'OkStatus'], picks: ['role', 'c', 'id', 'v', 'flag', 'p', 'ok'] },
  patch_server_owned: { ghosts: ['Role', 'C', 'Id'], picks: ['role', 'c', 'id'] },
  delete_doc:         { ghosts: ['Role', 'C', 'Id', 'V'], picks: ['role', 'c', 'id', 'v'] },
  add_element:        { ghosts: ['Role', 'Id', 'V', 'E', 'Whitelisted', 'OkStatus'], picks: ['role', 'id', 'v', 'e', 'flag', 'ok'] },
  patch_element:      { ghosts: ['Role', 'Id', 'V', 'E', 'TouchesKey', 'OkStatus'], picks: ['role', 'id', 'v', 'e', 'flag', 'ok'] },
  delete_element:     { ghosts: ['Role', 'Id', 'V', 'E'], picks: ['role', 'id', 'v', 'e'] },
  recompute_scores:   { ghosts: [], picks: [] },
};

function actionOf(state: Record<string, unknown>): { action: string; args: unknown[] } {
  const action = String(decode(state['mbt::actionTaken'] ?? state._lastAction));
  const spec = PARAMS[action];
  if (!spec) throw new Error(`trace names unknown action "${action}"`);
  const picks = state['mbt::nondetPicks'] as Record<string, unknown> | undefined;
  if (picks) {
    return { action, args: spec.picks.map(k => {
      const opt = decode(picks[k]) as { tag: string; value: unknown } | string;
      return typeof opt === 'object' && opt?.tag === 'Some' ? opt.value : undefined;
    }) };
  }
  return { action, args: spec.ghosts.map(g => decode(state[`_last${g}`])) };
}

/** Replays a trace; throws at the first diverging step, naming the var.field. */
async function replay(adapter: EntitiesAdapter, trace: Itf): Promise<void> {
  await adapter.reset();
  const check = async (i: number, label: string) => {
    const expected = trace.states[i];
    const observed: Record<string, unknown> = { st: await adapter.st(), last: await adapter.last() };
    for (const v of ['st', 'last']) {
      const exp = decode(expected[v]) as Record<string, unknown>;
      const obs = observed[v] as Record<string, unknown>;
      for (const field of Object.keys(exp)) {
        try {
          expect(obs[field]).toEqual(exp[field]);
        } catch {
          throw new Error(`step ${i} (${label}): ${v}.${field} diverged\n  expected ${JSON.stringify(exp[field])}\n  observed ${JSON.stringify(obs[field])}`);
        }
      }
    }
    // INV-001..INV-008 must hold in the real system at every step, not only
    // in the model's states the trace recorded.
    assertInvariants(observed.st as never, observed.last as never, `step ${i} (${label})`);
  };
  await check(0, 'init');
  for (let i = 1; i < trace.states.length; i++) {
    const { action, args } = actionOf(trace.states[i]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (adapter as any)[action](...args);
    await check(i, `${action}(${args.map(a => JSON.stringify(a)).join(', ')})`);
  }
}

/** Perturbs one value so it can no longer equal the original. */
function perturb(v: unknown): unknown {
  if (typeof v === 'number') return { '#bigint': String(v + 7) };
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'string') return `${v}~tampered`;
  const o = v as Record<string, unknown>;
  if ('#bigint' in o) return { '#bigint': String(Number(o['#bigint']) + 7) };
  if ('#map' in o) return { '#map': [...(o['#map'] as unknown[]), ['zz', { '#bigint': '9' }]] };
  if ('#set' in o) return { '#set': [...(o['#set'] as unknown[]), 'zz'] };
  if ('tag' in o) return { tag: o.tag === 'Ok' ? 'Conflict' : 'Ok', value: { tag: 'UNIT' } };
  throw new Error(`cannot perturb ${JSON.stringify(v)}`);
}

const traceFiles = fs.existsSync(TRACES_DIR)
  ? fs.readdirSync(TRACES_DIR).filter(f => f.endsWith('.itf.json') && !f.startsWith('_selftest.') && !f.includes('.cex.')).sort()
  : [];
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(TRACES_DIR, f), 'utf8')) as Itf;

describe('entities conformance replay', () => {
  let client: MongoClient;
  let adapter: EntitiesAdapter;

  beforeAll(async () => {
    if (traceFiles.length === 0) throw new Error(`no witness traces found in ${TRACES_DIR}`);
    client = await MongoClient.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    adapter = new EntitiesAdapter(client.db('entities_conformance'));
    await adapter.start();
  });

  afterAll(async () => {
    await adapter?.stop();
    await client?.close();
  });

  for (const f of traceFiles) {
    it(`replays ${f}`, async () => {
      await replay(adapter, load(f));
    });
  }

  // Self-test: the harness must be able to fail on EVERY observable field.
  // Each case corrupts one field of the final state of a real witness trace
  // and asserts replay rejects it, naming that field.
  describe('self-test: tampered traces fail', () => {
    const base = 'REQ-035.itf.json';
    const fields = traceFiles.includes(base)
      ? (['st', 'last'] as const).flatMap(v => Object.keys(load(base).states[0][v] as object).map(k => [v, k] as const))
      : [];
    for (const [v, field] of fields) {
      it(`_selftest.tampered.${v}.${field}`, async () => {
        const trace = load(base);
        const final = trace.states[trace.states.length - 1][v] as Record<string, unknown>;
        final[field] = perturb(final[field]);
        await expect(replay(adapter, trace)).rejects.toThrow(`${v}.${field} diverged`);
      });
    }
  });
});
