import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 seconds timeout for task generation
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Log request without sensitive data (password)
  const logData = config.data ? { ...config.data } : undefined
  if (logData && 'password' in logData) {
    logData.password = '***REDACTED***'
  }
  const fullUrl = config.baseURL && config.url 
    ? `${config.baseURL}${config.url.startsWith('/') ? '' : '/'}${config.url}`
    : config.url
  console.log('API Request:', config.method?.toUpperCase(), fullUrl, logData)
  return config
}, (error) => {
  console.error('API Request Error:', error)
  return Promise.reject(error)
})

// Handle 401 errors
api.interceptors.response.use(
  (response) => {
    const fullUrl = response.config.baseURL && response.config.url 
      ? `${response.config.baseURL}${response.config.url.startsWith('/') ? '' : '/'}${response.config.url}`
      : response.config.url
    // Don't log full response data for large responses
    const logData = response.data && typeof response.data === 'object' && Object.keys(response.data).length < 10
      ? response.data
      : (response.data?.constructor?.name || typeof response.data)
    console.log('API Response:', response.status, fullUrl, logData)
    return response
  },
  (error) => {
    const fullUrl = error.config?.baseURL && error.config?.url 
      ? `${error.config.baseURL}${error.config.url.startsWith('/') ? '' : '/'}${error.config.url}`
      : error.config?.url || 'unknown'
    console.error('API Response Error:', error.message)
    console.error('Error URL:', fullUrl)
    console.error('Error status:', error.response?.status)
    console.error('Error data:', error.response?.data)
    if (error.request && !error.response) {
      console.error('No response received - backend may be down or CORS issue')
      console.error('Request config:', error.config)
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      // Don't redirect if we're already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

