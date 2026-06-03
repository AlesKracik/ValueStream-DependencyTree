import { describe, it, expect, vi } from 'vitest';
import {
  chunk,
  buildParentLinkJql,
  searchAllPages,
  expandChildren,
  JiraFetchPage,
} from '../jiraSearch';

describe('chunk', () => {
  it('splits into fixed-size groups, last group short', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns empty for empty input', () => {
    expect(chunk([], 50)).toEqual([]);
  });

  it('throws on non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('buildParentLinkJql', () => {
  it('quotes keys and uses the Parent Link field with in()', () => {
    expect(buildParentLinkJql(['PROJ-1', 'PROJ-2'])).toBe(
      '"Parent Link" in ("PROJ-1", "PROJ-2")',
    );
  });
});

describe('searchAllPages', () => {
  it('returns single page when total fits', async () => {
    const fetchPage: JiraFetchPage = vi.fn().mockResolvedValue({
      issues: [{ key: 'A-1' }],
      names: { customfield_1: 'Target start' },
      total: 1,
    });
    const res = await searchAllPages(fetchPage, 'project = A');
    expect(res.issues).toEqual([{ key: 'A-1' }]);
    expect(res.names).toEqual({ customfield_1: 'Target start' });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith('project = A', 0);
  });

  it('follows pagination until total is reached and keeps first-page names', async () => {
    const fetchPage: JiraFetchPage = vi.fn()
      .mockResolvedValueOnce({ issues: [{ key: 'A-1' }, { key: 'A-2' }], names: { f: 'Team' }, total: 3 })
      .mockResolvedValueOnce({ issues: [{ key: 'A-3' }], names: {}, total: 3 });
    const res = await searchAllPages(fetchPage, 'project = A');
    expect(res.issues.map((i) => i.key)).toEqual(['A-1', 'A-2', 'A-3']);
    expect(res.names).toEqual({ f: 'Team' });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect((fetchPage as any).mock.calls[1]).toEqual(['project = A', 2]);
  });

  it('stops on an empty page even if total claims more', async () => {
    const fetchPage: JiraFetchPage = vi.fn().mockResolvedValue({ issues: [], total: 99 });
    const res = await searchAllPages(fetchPage, 'project = A');
    expect(res.issues).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe('expandChildren', () => {
  it('fetches children by Parent Link, dedupes against seen and within results', async () => {
    const seen = new Map<string, any>([['EPIC-1', { key: 'EPIC-1' }]]);
    const fetchPage: JiraFetchPage = vi.fn().mockImplementation((jql: string) => {
      expect(jql).toBe('"Parent Link" in ("EPIC-1")');
      // EPIC-1 echoed back (already seen) + two new children
      return Promise.resolve({
        issues: [{ key: 'EPIC-1' }, { key: 'STORY-1' }, { key: 'STORY-2' }],
        names: {},
        total: 3,
      });
    });
    const res = await expandChildren(fetchPage, ['EPIC-1'], seen);
    expect(res.added.map((i) => i.key)).toEqual(['STORY-1', 'STORY-2']);
    expect(res.failedChunks).toBe(0);
    expect([...seen.keys()]).toEqual(['EPIC-1', 'STORY-1', 'STORY-2']);
  });

  it('batches parent keys by chunkSize', async () => {
    const seen = new Map<string, any>();
    const calls: string[] = [];
    const fetchPage: JiraFetchPage = vi.fn().mockImplementation((jql: string) => {
      calls.push(jql);
      return Promise.resolve({ issues: [], total: 0 });
    });
    await expandChildren(fetchPage, ['A-1', 'A-2', 'A-3'], seen, { chunkSize: 2 });
    expect(calls).toEqual([
      '"Parent Link" in ("A-1", "A-2")',
      '"Parent Link" in ("A-3")',
    ]);
  });

  it('is fail-soft: a failed batch is counted and skipped', async () => {
    const seen = new Map<string, any>();
    const onChunkError = vi.fn();
    const fetchPage: JiraFetchPage = vi.fn()
      .mockRejectedValueOnce(new Error('Jira 500'))
      .mockResolvedValueOnce({ issues: [{ key: 'S-9' }], total: 1 });
    const res = await expandChildren(fetchPage, ['A-1', 'A-2'], seen, {
      chunkSize: 1,
      onChunkError,
    });
    expect(res.failedChunks).toBe(1);
    expect(res.added.map((i) => i.key)).toEqual(['S-9']);
    expect(onChunkError).toHaveBeenCalledTimes(1);
  });
});
