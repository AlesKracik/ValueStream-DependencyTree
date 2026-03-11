/**
 * Core authorization logic for the Vite backend plugin.
 * Extracted to a separate file for testability.
 */

export interface AuthStatus {
    required: boolean;
    authenticated: boolean;
}

export function checkAuth(
    url: string | undefined,
    headers: Record<string, string | string[] | undefined>,
    adminSecret: string | undefined
): { authorized: boolean; response?: any; statusCode?: number } {
    const isAuthRequired = !!adminSecret;
    
    // Only protect /api/ routes. Static assets and the main app must load to show the login UI.
    if (!url?.startsWith('/api/')) {
        return { authorized: true };
    }

    // Support both header formats
    let providedSecret = headers['x-admin-secret'] as string | undefined;
    const authHeader = headers['authorization'] as string | undefined;
    
    if (!providedSecret && authHeader?.startsWith('Bearer ')) {
        providedSecret = authHeader.substring(7);
    }

    // Special case for auth status endpoint
    if (url.startsWith('/api/auth/status')) {
        const isAuthorized = isAuthRequired ? providedSecret === adminSecret : true;
        return {
            authorized: true, // We always return a response for this endpoint
            statusCode: isAuthorized ? 200 : 401,
            response: { 
                required: isAuthRequired, 
                authenticated: isAuthorized 
            }
        };
    }

    // Regular API authorization
    if (isAuthRequired) {
        if (providedSecret !== adminSecret) {
            return {
                authorized: false,
                statusCode: 401,
                response: { success: false, error: 'Unauthorized' }
            };
        }
    }

    return { authorized: true };
}
