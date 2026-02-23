import React, { useState, useEffect } from 'react';
import type { Settings, DashboardData, Epic } from '../../types/models';

interface SettingsModalProps {
    onClose: () => void;
    settings: Settings;
    onUpdateSettings: (updates: Partial<Settings>) => void;
    data: DashboardData;
    updateEpic: (id: string, updates: Partial<Epic>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, settings, onUpdateSettings, data, updateEpic }) => {
    const [formData, setFormData] = useState<Partial<Settings>>({});
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<string>('');

    useEffect(() => {
        if (settings) {
            setFormData({
                jira_base_url: settings.jira_base_url,
                jira_api_version: settings.jira_api_version || '3',
                jira_api_token: settings.jira_api_token || ''
            });
        }
    }, [settings]);

    const handleTestConnection = async () => {
        if (!formData.jira_base_url || !formData.jira_api_token) {
            setTestResult({ success: false, message: 'Base URL and PAT are required to test.' });
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const response = await fetch('/api/jira/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jira_base_url: formData.jira_base_url,
                    jira_api_token: formData.jira_api_token,
                    jira_api_version: formData.jira_api_version || '3'
                })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                setTestResult({ success: true, message: data.message || 'Connection successful!' });
            } else {
                setTestResult({ success: false, message: data.error || 'Connection failed' });
            }
        } catch (e: any) {
            setTestResult({ success: false, message: e.message || 'Network error occurred testing connection.' });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSyncAllFromJira = async () => {
        const epicsWithKeys = data.epics.filter(e => e.jira_key && e.jira_key !== 'TBD');

        if (epicsWithKeys.length === 0) {
            setTestResult({ success: true, message: 'No epics with Jira keys found to sync.' });
            return;
        }
        if (!formData.jira_base_url || !formData.jira_api_token) {
            setTestResult({ success: false, message: 'Base URL and PAT are required to sync.' });
            return;
        }

        setIsSyncing(true);
        setTestResult(null);
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < epicsWithKeys.length; i++) {
            const epic = epicsWithKeys[i];
            setSyncProgress(`Syncing ${i + 1}/${epicsWithKeys.length}: ${epic.jira_key}`);

            try {
                const response = await fetch('/api/jira/issue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jira_key: epic.jira_key,
                        jira_base_url: formData.jira_base_url,
                        jira_api_version: formData.jira_api_version || '3',
                        jira_api_token: formData.jira_api_token
                    })
                });

                const resData = await response.json();
                if (!response.ok || !resData.success) {
                    throw new Error(resData.error || 'Failed to fetch Jira data');
                }

                const issue = resData.data;
                const fields = issue.fields;
                const names = issue.names;

                let targetStartKey = '';
                let targetEndKey = '';
                let teamKey = '';

                Object.entries(names as Record<string, string>).forEach(([key, name]) => {
                    if (name === 'Target start') targetStartKey = key;
                    if (name === 'Target end') targetEndKey = key;
                    if (name === 'Team') teamKey = key;
                });

                const updates: Partial<Epic> = {};
                if (fields.summary) updates.name = fields.summary;
                if (fields.timeestimate !== undefined && fields.timeestimate !== null) {
                    updates.remaining_md = Math.round(fields.timeestimate / 28800);
                }

                if (targetStartKey && fields[targetStartKey]) updates.target_start = fields[targetStartKey];
                if (targetEndKey && fields[targetEndKey]) updates.target_end = fields[targetEndKey];

                if (teamKey && fields[teamKey]) {
                    const teamField = fields[teamKey];
                    const jiraTeamId = (teamField.id || teamField.value || teamField.toString()).toString();
                    const jiraTeamName = teamField.name || '';

                    const matchedTeam = data.teams.find(t =>
                        (t.jira_team_id && t.jira_team_id.toString() === jiraTeamId) ||
                        (t.name === jiraTeamId) ||
                        (jiraTeamName && t.name === jiraTeamName)
                    );
                    if (matchedTeam) updates.team_id = matchedTeam.id;
                }

                updateEpic(epic.id, updates);
                successCount++;
            } catch (err: any) {
                console.error(`Error syncing ${epic.jira_key}:`, err);
                failCount++;
            }
        }

        setIsSyncing(false);
        setSyncProgress('');
        setTestResult({
            success: failCount === 0,
            message: `Sync complete. ${successCount} succeeded, ${failCount} failed.`
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdateSettings({
            jira_base_url: formData.jira_base_url,
            jira_api_version: formData.jira_api_version as '2' | '3',
            jira_api_token: formData.jira_api_token
        });
        onClose();
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} style={styles.formContainer}>
                    <h2 style={styles.title}>Global Settings</h2>

                    <label style={styles.label}>
                        Jira Base URL:
                        <input
                            style={styles.input}
                            type="url"
                            placeholder="https://yourdomain.atlassian.net"
                            value={formData.jira_base_url || ''}
                            onChange={e => setFormData({ ...formData, jira_base_url: e.target.value })}
                            required
                        />
                    </label>

                    <label style={styles.label}>
                        Jira API Version:
                        <select
                            style={styles.input}
                            value={formData.jira_api_version || '3'}
                            onChange={e => setFormData({ ...formData, jira_api_version: e.target.value as '2' | '3' })}
                        >
                            <option value="2">2</option>
                            <option value="3">3</option>
                        </select>
                    </label>

                    <label style={styles.label}>
                        Jira Personal Access Token (PAT):
                        <input
                            style={styles.input}
                            type="password"
                            placeholder="Your Jira PAT"
                            value={formData.jira_api_token || ''}
                            onChange={e => setFormData({ ...formData, jira_api_token: e.target.value })}
                        />
                    </label>

                    {testResult && (
                        <div style={{
                            padding: '10px',
                            borderRadius: '4px',
                            fontSize: '14px',
                            backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: testResult.success ? '#34d399' : '#f87171',
                            border: `1px solid ${testResult.success ? '#059669' : '#b91c1c'}`,
                            marginTop: '8px'
                        }}>
                            {testResult.message}
                        </div>
                    )}

                    <div style={styles.buttonGroup}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={handleTestConnection}
                                style={styles.testBtn}
                                disabled={isTesting || isSyncing || (!formData.jira_base_url && !formData.jira_api_token)}
                            >
                                {isTesting ? 'Testing...' : 'Test Connection'}
                            </button>
                            <button
                                type="button"
                                onClick={handleSyncAllFromJira}
                                style={{
                                    ...styles.testBtn,
                                    backgroundColor: '#3b82f6',
                                    color: '#fff',
                                    borderColor: '#2563eb'
                                }}
                                disabled={isTesting || isSyncing || (!formData.jira_base_url && !formData.jira_api_token)}
                            >
                                {isSyncing ? syncProgress : 'Sync Epics from Jira'}
                            </button>
                        </div>
                        <div style={styles.mainActionsGroup}>
                            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                            <button type="submit" style={styles.saveBtn}>Save</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    },
    modal: {
        backgroundColor: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        maxWidth: '90%',
        color: '#f9fafb',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
    },
    title: {
        marginTop: 0,
        marginBottom: '20px',
        fontSize: '18px',
        borderBottom: '1px solid #374151',
        paddingBottom: '10px'
    },
    formContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
    },
    label: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        fontSize: '14px',
        color: '#d1d5db'
    },
    input: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid #4b5563',
        backgroundColor: '#111827',
        color: '#f9fafb',
        fontSize: '14px'
    },
    buttonGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '24px',
        borderTop: '1px solid #374151',
        paddingTop: '16px'
    },
    mainActionsGroup: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
    },
    testBtn: {
        padding: '8px 16px',
        backgroundColor: '#374151',
        border: '1px solid #4b5563',
        color: '#f9fafb',
        borderRadius: '4px',
        cursor: 'pointer',
        alignSelf: 'stretch',
        fontWeight: 500,
        transition: 'background-color 0.2s',
    },
    cancelBtn: {
        padding: '8px 16px',
        backgroundColor: 'transparent',
        border: '1px solid #4b5563',
        color: '#d1d5db',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    saveBtn: {
        padding: '8px 16px',
        backgroundColor: '#8b5cf6',
        border: 'none',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 500
    }
};
