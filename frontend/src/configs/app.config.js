const appConfig = {
    // Relative '/api' works for the web build (Vite dev proxy locally, a
    // same-origin reverse proxy in production). A Capacitor-wrapped APK has
    // no such proxy - its WebView origin isn't the backend's - so it needs
    // an absolute URL, supplied at build time via VITE_API_BASE_URL.
    apiPrefix: import.meta.env.VITE_API_BASE_URL || '/api',
    authenticatedEntryPath: '/home',
    unAuthenticatedEntryPath: '/sign-in',
    locale: 'en',
    accessTokenPersistStrategy: 'localStorage',
    enableMock: true,
    activeNavTranslation: false,
}

export default appConfig
