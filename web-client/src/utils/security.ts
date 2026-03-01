/**
 * Sanitizes a URL to prevent XSS attacks.
 * Only allows http:, https:, and relative URLs.
 */
export function sanitizeUrl(url: string | undefined): string {
    if (!url) return '';
    
    // Remove whitespace and control characters
    const cleanUrl = url.replace(/[^\x20-\x7E]/g, '').trim();
    
    // Check if it starts with a safe protocol or is relative
    if (
        cleanUrl.startsWith('http://') || 
        cleanUrl.startsWith('https://') || 
        cleanUrl.startsWith('/') || 
        cleanUrl.startsWith('./') || 
        cleanUrl.startsWith('../')
    ) {
        return cleanUrl;
    }
    
    // Default to a safe placeholder if the URL is suspicious
    return 'about:blank';
}

/**
 * Generates a cryptographically strong unique ID.
 */
export function generateId(prefix: string = ''): string {
    // If crypto.randomUUID is available (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}${crypto.randomUUID()}`;
    }
    
    // Fallback for older environments
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    let hex = '';
    for (let i = 0; i < array.length; i++) {
        hex += array[i].toString(16).padStart(8, '0');
    }
    return `${prefix}${hex}`;
}
