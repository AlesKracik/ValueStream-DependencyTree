import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AhaSettings } from '../AhaSettings';
import * as api from '../../../utils/api';
import type { Settings, ValueStreamData, WorkItem } from '@valuestream/shared-types';

vi.mock('../../../utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/api')>()),
  importAhaFeatures: vi.fn(),
  importAhaEpics: vi.fn(),
  syncAhaFeature: vi.fn(),
  syncAhaEpic: vi.fn(),
}));

const settings = {
  aha: { subdomain: 'acme', api_key: 'key', workspace: 'DR' },
} as unknown as Settings;

// Shaped like a real Aha! feature (GET /api/v1/features/DR-106).
const fullFeature = {
  id: '7001',
  reference_num: 'DR-106',
  name: 'Faster restore',
  url: 'https://acme.aha.io/features/DR-106',
  score: 36,
  description: { body: '<p>Restore <b>faster</b></p>' },
  original_estimate: 960,
  requirements: [{ id: 'r1', reference_num: 'DR-106-1', name: 'Req', description: { body: 'x' }, url: 'u' }],
};

const syncedItem: WorkItem = {
  id: 'w1', name: 'Old name', description: 'Old description', status: 'Backlog',
  total_effort_mds: 5, score: 0, customer_targets: [], origin: 'aha',
  links: {
    aha: {
      external_id: '7001', key: 'DR-106', url: 'https://acme.aha.io/features/DR-106',
      data: { name: 'Old name', description: '<p>Old description</p>', score: 20, estimate_mds: 1, requirements: [] },
    },
  },
};

const renderAha = (workItems: WorkItem[]) => {
  const props = {
    localFormData: settings,
    updateFormData: vi.fn(),
    onUpdateSettings: vi.fn(),
    settings,
    data: { workItems } as unknown as ValueStreamData,
    updateIssue: vi.fn(),
    addIssue: vi.fn(),
    updateCustomer: vi.fn(),
    updateWorkItem: vi.fn().mockResolvedValue(undefined),
    addWorkItem: vi.fn().mockResolvedValue({ id: 'new' }),
  };
  render(
    <MemoryRouter initialEntries={['/?subtab=work-items']}>
      <AhaSettings {...props} />
    </MemoryRouter>
  );
  return props;
};

describe('AhaSettings — import and sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.importAhaEpics).mockResolvedValue([]);
  });

  it('import with a sparse payload keeps the stored Aha! data of a matched item', async () => {
    vi.mocked(api.importAhaFeatures).mockResolvedValue([
      { id: '7001', reference_num: 'DR-106', name: 'Old name', url: 'https://acme.aha.io/features/DR-106' },
    ]);
    const props = renderAha([syncedItem]);

    fireEvent.click(screen.getByText('Import from Aha!'));

    await waitFor(() => expect(props.updateWorkItem).toHaveBeenCalled());
    const [id, updates] = props.updateWorkItem.mock.calls[0];
    expect(id).toBe('w1');
    expect(updates.links.aha.data).toMatchObject({
      score: 20, description: '<p>Old description</p>', estimate_mds: 1, requirements: [],
    });
    expect(updates.description).toBe('Old description');
    expect(updates).not.toHaveProperty('total_effort_mds');
    expect(props.addWorkItem).not.toHaveBeenCalled();
    expect(await screen.findByText(/Created 0, updated 1, failed 0/)).toBeDefined();
  });

  it('sync with a full payload replaces the values Aha! changed', async () => {
    vi.mocked(api.syncAhaFeature).mockResolvedValue(fullFeature);
    const props = renderAha([syncedItem]);

    fireEvent.click(screen.getByText('Sync Work Items from Aha!'));

    await waitFor(() => expect(props.updateWorkItem).toHaveBeenCalled());
    const updates = props.updateWorkItem.mock.calls[0][1];
    expect(updates.links.aha.data).toMatchObject({
      name: 'Faster restore', score: 36, description: '<p>Restore <b>faster</b></p>', estimate_mds: 2,
    });
    expect(updates).toMatchObject({ origin: 'aha', name: 'Faster restore', description: 'Restore faster' });
  });

  it('import of a full payload creates a new item with Product Value and the derived fields', async () => {
    vi.mocked(api.importAhaFeatures).mockResolvedValue([fullFeature]);
    const props = renderAha([]);

    fireEvent.click(screen.getByText('Import from Aha!'));

    await waitFor(() => expect(props.addWorkItem).toHaveBeenCalled());
    const created = props.addWorkItem.mock.calls[0][0];
    expect(created).toMatchObject({
      origin: 'aha', name: 'Faster restore', description: 'Restore faster', total_effort_mds: 0,
    });
    expect(created.links.aha).toMatchObject({ external_id: '7001', key: 'DR-106', data: { score: 36 } });
    expect(await screen.findByText(/Created 1, updated 0, failed 0/)).toBeDefined();
  });

  it('imports epics first and puts each feature under its epic\'s work item', async () => {
    vi.mocked(api.importAhaEpics).mockResolvedValue([
      { id: '900', reference_num: 'DR-E-1', name: 'Restore set', description: { body: '' }, score: 5 },
    ]);
    vi.mocked(api.importAhaFeatures).mockResolvedValue([
      { ...fullFeature, epic: { id: '900', reference_num: 'DR-E-1' } },
      { ...fullFeature, id: '7002', reference_num: 'DR-107', name: 'Loose', epic: null },
    ]);
    const props = renderAha([]);
    props.addWorkItem
      .mockResolvedValueOnce({ id: 'wi-epic' })
      .mockResolvedValueOnce({ id: 'wi-f1' })
      .mockResolvedValueOnce({ id: 'wi-f2' });

    fireEvent.click(screen.getByText('Import from Aha!'));

    await waitFor(() => expect(props.addWorkItem).toHaveBeenCalledTimes(3));
    const [epic, inEpic, loose] = props.addWorkItem.mock.calls.map(c => c[0]);
    expect(epic).toMatchObject({ origin: 'aha', name: 'Restore set', links: { aha: { record_type: 'epic', key: 'DR-E-1' } } });
    expect(epic).not.toHaveProperty('parent_id');
    expect(inEpic).toMatchObject({ name: 'Faster restore', parent_id: 'wi-epic', links: { aha: { record_type: 'feature', data: { epic_id: '900' } } } });
    expect(loose).toMatchObject({ name: 'Loose', links: { aha: { data: { epic_id: null } } } });
    expect(loose).not.toHaveProperty('parent_id'); // no epic: the parent stays local
    expect(await screen.findByText(/Created 3, updated 0, failed 0 \(epics: 1 created.*features: 2 created/)).toBeDefined();
  });

  it('sync all refreshes an Aha! epic through the epic endpoint', async () => {
    vi.mocked(api.syncAhaEpic).mockResolvedValue({ id: '900', reference_num: 'DR-E-1', name: 'Renamed set', description: { body: '<p>d</p>' } });
    const epicItem: WorkItem = {
      id: 'wi-epic', name: 'Old', status: 'Backlog', total_effort_mds: 0, score: 0, customer_targets: [], origin: 'aha',
      links: { aha: { external_id: '900', key: 'DR-E-1', record_type: 'epic', data: { name: 'Old' } } },
    };
    const props = renderAha([epicItem]);

    fireEvent.click(screen.getByText('Sync Work Items from Aha!'));

    await waitFor(() => expect(props.updateWorkItem).toHaveBeenCalled());
    expect(api.syncAhaEpic).toHaveBeenCalledWith('DR-E-1', expect.any(Object));
    expect(api.syncAhaFeature).not.toHaveBeenCalled();
    expect(props.updateWorkItem.mock.calls[0][1]).toMatchObject({ name: 'Renamed set', description: 'd' });
  });
});
