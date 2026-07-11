import axios from 'axios'
import { PRODUCTION_API, resolveApiBaseUrl } from '../config/apiBase'

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds timeout - reduced from 60s for faster error detection
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    // Ensure headers object exists
    if (!config.headers) {
      config.headers = {} as any
    }
    // Set Authorization header, preserving any existing headers
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
      console.error('❌ No response received - backend may be down or CORS issue')
      console.error('Request config:', error.config)
      console.error('Request URL:', error.config?.url)
      console.error('Request method:', error.config?.method)
      console.error('Request baseURL:', error.config?.baseURL)
      if (error.code === 'ECONNREFUSED') {
        console.error('🔴 Connection refused - Backend is not running on', error.config?.baseURL)
        alert(`Backend server is not reachable at ${error.config?.baseURL || PRODUCTION_API}`)
      } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        console.error('⏱️ Request timeout - Backend may be slow or unresponsive')
        alert('Request timeout — backend on Render may be waking up (free tier). Try again in 30 seconds.')
      } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
        console.error('🌐 Network error - Check CORS or backend connection')
        alert(`Network error — cannot reach API at ${error.config?.baseURL || PRODUCTION_API}. Check Render status or try Cmd+Shift+R.`)
      }
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      const loginPath = `${import.meta.env.BASE_URL}login`.replace(/\/{2,}/g, '/')
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath
      }
    }
    return Promise.reject(error)
  }
)

export default api

