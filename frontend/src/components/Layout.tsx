import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import FolderTree from './FolderTree'
import './Layout.css'

interface LayoutProps {
  children: React.ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showFrameworkOwner, setShowFrameworkOwner] = useState(false)

  useEffect(() => {
    if (!user) {
      setShowFrameworkOwner(false)
      return
    }
    api.get('/admin/permissions')
      .then((res) => setShowFrameworkOwner(res.data?.can_manage_frameworks === true))
      .catch(() => setShowFrameworkOwner(false))
  }, [user?.id])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path: string) => location.pathname.startsWith(path)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>SDLC Governance</h2>
        </div>
        <nav className="sidebar-nav">
          <Link 
            to="/dashboard" 
            className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}
          >
            📊 IT Dashboard
          </Link>
          <Link 
            to="/projects" 
            className={`nav-item ${isActive('/projects') && !location.pathname.startsWith('/compliance') && !location.pathname.startsWith('/admin') && !location.pathname.startsWith('/auditor') && !location.pathname.startsWith('/framework-owner') && !location.pathname.match(/^\/projects\/[^/]+$/) ? 'active' : ''}`}
          >
            💻 Dev Projects
          </Link>
          <Link 
            to="/compliance" 
            className={`nav-item ${isActive('/compliance') ? 'active' : ''}`}
          >
            🛡️ Compliance & Security
          </Link>
          <Link 
            to="/templates" 
            className={`nav-item ${isActive('/templates') ? 'active' : ''}`}
          >
            📄 Templates
          </Link>
          <Link 
            to="/admin" 
            className={`nav-item ${isActive('/admin') ? 'active' : ''}`}
          >
            ⚙️ Admin
          </Link>
          {showFrameworkOwner && (
            <Link
              to="/framework-owner"
              className={`nav-item ${isActive('/framework-owner') ? 'active' : ''}`}
            >
              📋 Framework Owner
            </Link>
          )}
          <Link 
            to="/auditor" 
            className={`nav-item ${isActive('/auditor') ? 'active' : ''}`}
          >
            🔍 Auditor
          </Link>
          <div className="nav-separator"></div>
          {isActive('/projects') && location.pathname.match(/^\/projects\/[^/]+$/) ? (
            <FolderTree />
          ) : null}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
            <div className="user-details">
              <div className="user-name">{user?.name || 'User'}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

export default Layout
