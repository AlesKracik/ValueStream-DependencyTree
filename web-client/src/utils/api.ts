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
