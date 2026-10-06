import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AhaSettings } from '../AhaSettings';
import * as api from '../../../utils/api';
import type { Settings, ValueStreamData, WorkItem } from '@valuestream/shared-types';

vi.mock('../../../utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/api')>()),
  importAhaFeatures: vi.fn(),
  syncAhaFeature: vi.fn(),
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
  beforeEach(() => vi.clearAllMocks());

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
});
