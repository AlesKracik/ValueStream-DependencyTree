export const getAdminSecret = () => sessionStorage.getItem('ADMIN_SECRET') || '';
export const setAdminSecret = (secret: string) => sessionStorage.setItem('ADMIN_SECRET', secret);
export const clearAdminSecret = () => sessionStorage.removeItem('ADMIN_SECRET');

export const authorizedFetch = async (url: string, options: RequestInit = {}) => {
    const secret = getAdminSecret();
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${secret}`
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        clearAdminSecret();
        // Trigger a reload or a state change to show login
        window.location.reload();
    }

    return response;
};

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export const syncJiraIssue = async (
    jiraKey: string,
    settings: { jira_base_url?: string; jira_api_version?: string; jira_api_token?: string }
): Promise<any> => {
    if (!jiraKey || jiraKey === 'TBD') {
        throw new Error('Please enter a valid Jira Key before syncing.');
    }

    const response = await authorizedFetch("/api/jira/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jira_key: jiraKey,
            jira_base_url: settings.jira_base_url,
            jira_api_version: settings.jira_api_version || "3",
            jira_api_token: settings.jira_api_token,
        }),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok || !resData.success) {
        throw new Error(resData?.error || "Failed to fetch Jira data");
    }

    return resData.data;
};
