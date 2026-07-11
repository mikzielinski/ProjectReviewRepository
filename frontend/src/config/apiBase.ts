const PRODUCTION_API = 'https://projectreviewrepository.onrender.com/api/v1'

/** Resolve API base URL for dev (proxy), GitHub Pages, or explicit VITE_API_URL. */
export function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv && !fromEnv.includes('localhost')) {
    return fromEnv
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host.includes('github.io') || host.includes('mikzielinski.github.io')) {
      return PRODUCTION_API
    }
  }
  if (fromEnv) return fromEnv
  return '/api/v1'
}

export { PRODUCTION_API }
