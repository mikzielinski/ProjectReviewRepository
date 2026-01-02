import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FolderTree from './FolderTree'
import './Layout.css'

interface LayoutProps {
  children: React.ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

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
            to="/templates" 
            className={`nav-item ${isActive('/templates') ? 'active' : ''}`}
          >
            📄 Templates
          </Link>
          <div className="nav-separator"></div>
          {isActive('/projects') && !isActive('/templates') ? (
            <FolderTree />
          ) : (
            <Link 
              to="/projects" 
              className={`nav-item ${isActive('/projects') && !isActive('/templates') ? 'active' : ''}`}
            >
              📁 Projects
            </Link>
          )}
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
