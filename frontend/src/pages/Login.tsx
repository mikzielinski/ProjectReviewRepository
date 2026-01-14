import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Login form submitted:', { email, hasPassword: !!password })
    setError('')
    try {
      await login(email, password)
      console.log('Login successful, navigating to /projects')
      navigate('/projects')
    } catch (err: any) {
      console.error('Login error in form:', err)
      console.error('Error response:', err.response?.data)
      setError(err.response?.data?.detail || err.message || 'Login failed')
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>SDLC Governance Platform</h1>
        <form 
          onSubmit={handleSubmit} 
          className="login-form"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              console.log('Enter key pressed in form')
            }
          }}
        >
          <div className="form-group">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              placeholder="Password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button 
            type="submit" 
            className="login-btn"
            onClick={() => {
              console.log('Login button clicked')
              // handleSubmit will be called by form onSubmit
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login

