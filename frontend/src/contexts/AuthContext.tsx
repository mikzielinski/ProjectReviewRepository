import React, { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

interface User {
  id: string
  email: string
  name: string
  is_active: boolean
}

interface AuthContextType {
  user: User | null
  login: (email: string, password?: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api
        .get('/auth/me')
        .then((res) => setUser(res.data))
        .catch((err) => {
          console.error('Error fetching user:', err)
          localStorage.removeItem('token')
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password?: string) => {
    try {
      console.log('Attempting login with:', { email, hasPassword: !!password })
      console.log('API base URL:', api.defaults.baseURL)
      console.log('Full URL will be:', `${api.defaults.baseURL}/auth/login`)
      const res = await api.post('/auth/login', { email, password: password || 'changeme' })
      console.log('Login response status:', res.status)
      console.log('Login response data:', res.data)
      if (res.data.access_token) {
        localStorage.setItem('token', res.data.access_token)
        console.log('Token saved to localStorage')
      }
      if (res.data.user) {
        setUser(res.data.user)
        console.log('User set in context:', res.data.user)
      } else {
        console.warn('No user data in response')
      }
    } catch (error: any) {
      console.error('❌ Login error:', error)
      console.error('Error type:', error.constructor.name)
      console.error('Error message:', error.message)
      console.error('Error code:', error.code)
      console.error('Error response status:', error.response?.status)
      console.error('Error response data:', error.response?.data)
      console.error('Error response headers:', error.response?.headers)
      if (error.request && !error.response) {
        console.error('🔴 Request was made but no response received')
        console.error('Request URL:', error.config?.url)
        console.error('Request baseURL:', error.config?.baseURL)
        if (error.code === 'ECONNREFUSED') {
          alert('❌ Backend server is not running!\n\nPlease start the backend server:\ncd backend && python -m uvicorn app.main:app --reload')
        } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
          alert('⏱️ Request timeout!\n\nThe backend server may be slow or unresponsive.\nPlease check if the server is running.')
        } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          alert('🌐 Network error!\n\nPlease check:\n1. Backend server is running on http://localhost:8000\n2. CORS is configured correctly\n3. No firewall blocking the connection')
        }
      }
      throw error
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

