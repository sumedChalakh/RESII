export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)resii_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setupCsrfInterceptor() {
  if (typeof window === 'undefined' || !window.fetch) return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const options: RequestInit = init ? { ...init } : {};
    const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        if (!options.headers) {
          options.headers = {};
        }
        if (options.headers instanceof Headers) {
          if (!options.headers.has('X-CSRF-Token')) {
            options.headers.set('X-CSRF-Token', csrfToken);
          }
        } else if (Array.isArray(options.headers)) {
          const hasCsrf = options.headers.some(([k]) => k.toLowerCase() === 'x-csrf-token');
          if (!hasCsrf) {
            options.headers.push(['X-CSRF-Token', csrfToken]);
          }
        } else {
          const headerObj = options.headers as Record<string, string>;
          if (!headerObj['X-CSRF-Token'] && !headerObj['x-csrf-token']) {
            headerObj['X-CSRF-Token'] = csrfToken;
          }
        }
      }
    }
    return originalFetch(input, options);
  };
}
