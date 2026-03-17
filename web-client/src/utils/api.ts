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

 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    settings: { base_url?: string; api_version?: string; api_token?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
    if (!jiraKey || jiraKey === 'TBD') {
        throw new Error('Please enter a valid Jira Key before syncing.');
    }

    const response = await authorizedFetch("/api/jira/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jira_key: jiraKey,
            jira: {
                base_url: settings.base_url,
                api_version: settings.api_version || "3",
                api_token: settings.api_token,
            }
        }),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok || !resData.success) {
        throw new Error(resData?.error || "Failed to fetch Jira data");
    }

    return resData.data;
};

export const syncAhaFeature = async (
    referenceNum: string,
    ahaSettings: { subdomain?: string; api_key?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
    if (!referenceNum) {
        throw new Error('Please enter a valid Aha! Reference Number before syncing.');
    }

    const response = await authorizedFetch("/api/aha/feature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            reference_num: referenceNum,
            aha: {
                subdomain: ahaSettings.subdomain,
                api_key: ahaSettings.api_key,
            }
        }),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok || !resData.success) {
        throw new Error(resData?.error || "Failed to fetch Aha! data");
    }

    return resData.feature;
};

export const llmGenerate = async (
    prompt: string,
    config: unknown
): Promise<string> => {
    const response = await authorizedFetch("/api/llm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, config }),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok || !resData.success) {
        throw new Error(resData?.error || "Failed to generate LLM response");
    }

    return resData.text;
};
