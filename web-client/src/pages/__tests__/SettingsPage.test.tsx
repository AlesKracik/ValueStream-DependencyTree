import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SettingsPage } from '../SettingsPage';
import type { ValueStreamData, Settings } from '../../types/models';
import { MemoryRouter } from 'react-router-dom';

// Mock ValueStreamContext
const mockShowAlert = vi.fn();
const mockShowConfirm = vi.fn();

vi.mock('../../contexts/ValueStreamContext', () => ({
    useValueStreamContext: () => ({
        showAlert: mockShowAlert,
        showConfirm: mockShowConfirm
    })
}));

const mockSettings: Settings = {
    general: {
        fiscal_year_start_month: 1,
        sprint_duration_days: 14
    },
    persistence: {
        mongo: {
            app: {
                uri: 'mongodb://localhost:27017',
                db: 'testdb',
                use_proxy: false,
                auth: { method: 'scram' }
            },
            customer: {
                uri: '',
                db: '',
                use_proxy: false,
                auth: { method: 'scram' }
            }
        }
    },
    jira: {
        base_url: 'https://jira.com',
        api_version: '3',
        api_token: 'token'
    },
    ai: {
        provider: 'openai',
        api_key: ''
    }
};

const mockData: ValueStreamData = {
    valueStreams: [],
    settings: mockSettings,
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: []
};

describe('SettingsPage', () => {
    const onUpdateSettings = vi.fn();
    const updateEpic = vi.fn();
    const addEpic = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            if (url === '/api/mongo/databases') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, databases: ['db1', 'db2', 'testdb'] })
                });
            }
            if (url === '/api/mongo/test') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, exists: true, message: 'Connection successful!' })
                });
            }
            return Promise.resolve({ 
                ok: true,
                json: () => Promise.resolve({ 
                    success: true, 
                    data: mockData,
                    message: 'Success' 
                })
            });
        }));
        
        // Mock URL methods for download
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn().mockReturnValue('mock-url'),
            revokeObjectURL: vi.fn()
        });
    });

    it('renders and shows Export button in Persistence tab', () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        expect(screen.getByText('Export to JSON')).toBeDefined();
        expect(screen.getByText('Import from JSON')).toBeDefined();
    });

    it('calls export API and triggers download when Export button is clicked', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const exportBtn = screen.getByText('Export to JSON');
        await act(async () => {
            fireEvent.click(exportBtn);
        });

        expect(fetch).toHaveBeenCalledWith('/api/mongo/export', expect.objectContaining({
            method: 'POST'
        }));

        await waitFor(() => {
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(screen.getByText(/Export successful! valuestream_export.json download started/i)).toBeDefined();
        });
    });

    it('calls import API when a file is selected and confirmed', async () => {
        mockShowConfirm.mockResolvedValue(true);
        const reloadSpy = vi.fn();
        vi.stubGlobal('location', { reload: reloadSpy });

        const { container } = render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const fileInput = container.querySelector('input[type="file"]')!;
        const file = new File(['{"data": {"customers": []}}'], 'test.json', { type: 'application/json' });

        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [file] } });
        });

        expect(mockShowConfirm).toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledWith('/api/mongo/import', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"data":{"data":{"customers":[]}}')
        }));

        await waitFor(() => {
            expect(screen.getByText(/Import successful! Data has been restored/i)).toBeDefined();
        });
    });

    it('shows AWS fields when AWS IAM is selected via props', async () => {
        const awsSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: { method: 'aws' as const, aws_auth_type: 'static' as const }
                    }
                }
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={awsSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        expect(screen.getByText('AWS IAM Credentials')).toBeDefined();
        expect(screen.getByLabelText(/Access Key ID:/i)).toBeDefined();
    });

    it('saves connection settings on blur', async () => {
        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={mockSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        const uriInput = screen.getByLabelText(/MongoDB URI:/i);
        
        await act(async () => {
            fireEvent.change(uriInput, { target: { value: 'mongodb://new-host:27017' } });
        });
        
        expect(onUpdateSettings).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.blur(uriInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            persistence: expect.objectContaining({
                mongo: expect.objectContaining({
                    app: expect.objectContaining({ uri: 'mongodb://new-host:27017' })
                })
            })
        }));
    });

    it('shows AWS Assume Role configuration when role type is active', async () => {
        const roleSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: { 
                            method: 'aws' as const, 
                            aws_auth_type: 'role' as const,
                            aws_profile: 'test-profile'
                        }
                    }
                }
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={roleSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Role ARN:/i)).toBeDefined();
        expect(screen.getByLabelText(/External ID \(Optional\):/i)).toBeDefined();
        
        const arnInput = screen.getByLabelText(/Role ARN:/i);
        await act(async () => {
            fireEvent.change(arnInput, { target: { value: 'arn:aws:iam::123:role/MyRole' } });
            fireEvent.blur(arnInput);
        });

        expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
            persistence: expect.objectContaining({
                mongo: expect.objectContaining({
                    app: expect.objectContaining({
                        auth: expect.objectContaining({ aws_role_arn: 'arn:aws:iam::123:role/MyRole' })
                    })
                })
            })
        }));
    });

    it('shows Manual SSO Configuration when profile is empty', async () => {
        const ssoManualSettings = {
            ...mockSettings,
            persistence: {
                ...mockSettings.persistence,
                mongo: {
                    ...mockSettings.persistence.mongo,
                    app: {
                        ...mockSettings.persistence.mongo.app,
                        auth: { 
                            method: 'aws' as const, 
                            aws_auth_type: 'static' as const,
                            aws_profile: ''
                        }
                    }
                }
            }
        };

        render(
            <MemoryRouter initialEntries={['/settings?tab=persistence']}>
                <SettingsPage 
                    settings={ssoManualSettings} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        expect(screen.getByText(/Manual SSO Configuration \(No Profile\):/i)).toBeDefined();
        expect(screen.getByLabelText(/SSO Start URL:/i)).toBeDefined();
        expect(screen.getByLabelText(/SSO Region:/i)).toBeDefined();
    });

    it('renders correctly with empty settings using defaults', () => {
        // This test verifies that the fix for "Cannot read properties of undefined (reading 'fiscal_year_start_month')" works
        render(
            <MemoryRouter initialEntries={['/settings?tab=general']}>
                <SettingsPage 
                    settings={null as any} 
                    onUpdateSettings={onUpdateSettings}
                    data={mockData}
                    updateEpic={updateEpic}
                    addEpic={addEpic}
                />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Fiscal Year Start Month:/i)).toBeDefined();
        // Default value should be 1 (January)
        const select = screen.getByLabelText(/Fiscal Year Start Month:/i) as HTMLSelectElement;
        expect(select.value).toBe('1');
    });
});
