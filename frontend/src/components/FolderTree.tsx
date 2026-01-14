import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'
// import { useAuth } from '../contexts/AuthContext' // Not used currently
import './FolderTree.css'

interface Project {
  id: string
  name: string
  key: string
  status: string
}

interface Folder {
  id: string | null
  name: string
  parent_folder_id: string | null
  subfolders: Folder[]
  projects: Project[]
}

interface FolderTreeProps {
  onProjectClick?: (projectId: string) => void
}

const FolderTree = ({ onProjectClick }: FolderTreeProps) => {
  const [folders, setFolders] = useState<Folder[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedParentFolder, setSelectedParentFolder] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [_deleting, setDeleting] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ type: 'folder' | 'project', id: string, x: number, y: number } | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  // const { user } = useAuth() // Not used currently

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null)
    }
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  useEffect(() => {
    loadFolders()
  }, [])

  const loadFolders = async () => {
    try {
      const response = await api.get('/folders')
      console.log('Folders loaded:', response.data)
      setFolders(response.data || [])
    } catch (error: any) {
      console.error('Failed to load folders:', error)
      if (error.response?.status === 403) {
        console.log('User is not admin, folder creation disabled')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    
    setCreating(true)
    try {
      await api.post('/folders', {
        name: newFolderName.trim(),
        parent_folder_id: selectedParentFolder || null
      })
      setNewFolderName('')
      setSelectedParentFolder(null)
      setShowCreateFolder(false)
      loadFolders()
    } catch (error: any) {
      console.error('Failed to create folder:', error)
      alert(error.response?.data?.detail || 'Failed to create folder')
    } finally {
      setCreating(false)
    }
  }

  const handleEditFolder = (folder: Folder, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!folder.id) return
    setEditingFolder(folder)
    setNewFolderName(folder.name)
    setSelectedParentFolder(folder.parent_folder_id)
    setShowCreateFolder(false)
  }

  const handleUpdateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingFolder || !editingFolder.id || !newFolderName.trim()) return
    
    setUpdating(true)
    try {
      await api.put(`/folders/${editingFolder.id}`, {
        name: newFolderName.trim(),
        parent_folder_id: selectedParentFolder || null
      })
      setEditingFolder(null)
      setNewFolderName('')
      setSelectedParentFolder(null)
      loadFolders()
    } catch (error: any) {
      console.error('Failed to update folder:', error)
      alert(error.response?.data?.detail || 'Failed to update folder')
    } finally {
      setUpdating(false)
    }
  }

  const handleDeleteFolder = async (folderId: string | null, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!folderId) return
    if (!confirm('Are you sure you want to delete this folder? All subfolders and projects in it will be moved to root.')) return
    
    setDeleting(folderId)
    try {
      await api.delete(`/folders/${folderId}`)
      loadFolders()
    } catch (error: any) {
      console.error('Failed to delete folder:', error)
      alert(error.response?.data?.detail || 'Failed to delete folder')
    } finally {
      setDeleting(null)
    }
  }

  const cancelEdit = () => {
    setEditingFolder(null)
    setNewFolderName('')
    setSelectedParentFolder(null)
  }

  const getAllFoldersFlat = (folders: Folder[]): Folder[] => {
    const result: Folder[] = []
    folders.forEach(folder => {
      result.push(folder)
      if (folder.subfolders.length > 0) {
        result.push(...getAllFoldersFlat(folder.subfolders))
      }
    })
    return result
  }

  const toggleFolder = (folderId: string | null) => {
    if (folderId === null) return
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
  }

  const handleProjectClick = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (onProjectClick) {
      onProjectClick(projectId)
    } else {
      navigate(`/projects/${projectId}`)
    }
  }

  const handleMoveProjectToFolder = async (projectId: string, targetFolderId: string | null) => {
    try {
      await api.post(`/folders/projects/${projectId}/move`, {
        folder_id: targetFolderId
      })
      loadFolders()
    } catch (error: any) {
      console.error('Failed to move project:', error)
      alert(error.response?.data?.detail || 'Failed to move project')
    }
  }

  // Get active project ID from URL
  const getActiveProjectId = () => {
    const match = location.pathname.match(/\/projects\/([^/]+)/)
    return match ? match[1] : null
  }

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'project', id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ type, id, x: e.clientX, y: e.clientY })
  }

  const renderFolder = (folder: Folder, level: number = 0, allFolders: Folder[] = []) => {
    const folderId = folder.id || 'root'
    const isExpanded = expandedFolders.has(folderId)
    const hasChildren = folder.subfolders.length > 0 || folder.projects.length > 0
    const isRoot = folder.id === null
    // const availableFolders = getAllFoldersFlat(allFolders.length > 0 ? allFolders : folders) // Not used currently
    const activeProjectId = getActiveProjectId()

    return (
      <div key={folderId} className="folder-item">
        <div
          className={`folder-header ${hasChildren ? 'has-children' : ''} ${isRoot ? 'root-folder' : ''}`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => hasChildren && toggleFolder(folderId)}
          onContextMenu={folder.id ? (e) => handleContextMenu(e, 'folder', folder.id!) : undefined}
        >
          {hasChildren ? (
            <span className={`folder-toggle ${isExpanded ? 'expanded' : ''}`}>
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                <path d="M3.5 2.5L6.5 5L3.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          ) : (
            <span className="folder-toggle-spacer"></span>
          )}
          <span className="folder-icon">📁</span>
          <span className="folder-name">{folder.name}</span>
          {folder.id && (
            <button
              className="context-menu-trigger"
              onClick={(e) => {
                e.stopPropagation()
                handleContextMenu(e, 'folder', folder.id!)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextMenu(e, 'folder', folder.id!)
              }}
              title="Folder options"
            >
              ⋮
            </button>
          )}
        </div>
        {isExpanded && (
          <div className="folder-content">
            {folder.subfolders.map((subfolder) => renderFolder(subfolder, level + 1, allFolders.length > 0 ? allFolders : folders))}
            {folder.projects.map((project) => {
              const isActive = project.id === activeProjectId
              return (
                <div
                  key={project.id}
                  className={`project-item ${isActive ? 'active' : ''}`}
                  style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}
                  onClick={(e) => handleProjectClick(project.id, e)}
                  onContextMenu={(e) => handleContextMenu(e, 'project', project.id)}
                >
                  <div className="project-item-indicator"></div>
                  <span className="project-icon">📄</span>
                  <span className="project-name">{project.name}</span>
                  <button
                    className="context-menu-trigger"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleContextMenu(e, 'project', project.id)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleContextMenu(e, 'project', project.id)
                    }}
                    title="Project options"
                  >
                    ⋮
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="folder-tree-loading">Loading folders...</div>
  }

  const allFoldersFlat = getAllFoldersFlat(folders)

  return (
    <div className="folder-tree">
      <div className="folder-tree-header">
        <h3>Projects</h3>
        <button
          className="folder-create-btn"
          onClick={() => setShowCreateFolder(!showCreateFolder)}
          title="Create new folder (Admin only)"
        >
          + Folder
        </button>
      </div>
      
      {(showCreateFolder || editingFolder) && (
        <div className="folder-create-form">
          <form onSubmit={editingFolder ? handleUpdateFolder : handleCreateFolder}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              required
              autoFocus
            />
            <select
              value={selectedParentFolder || ''}
              onChange={(e) => setSelectedParentFolder(e.target.value || null)}
            >
              <option value="">Root (no parent)</option>
              {allFoldersFlat
                .filter(f => f.id && f.id !== editingFolder?.id) // Don't allow selecting self as parent
                .map((folder) => (
                  folder.id && (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  )
                ))}
            </select>
            <div className="folder-form-actions">
              <button type="submit" disabled={(creating || updating) || !newFolderName.trim()}>
                {editingFolder 
                  ? (updating ? 'Updating...' : 'Update')
                  : (creating ? 'Creating...' : 'Create')
                }
              </button>
              <button type="button" onClick={() => {
                setShowCreateFolder(false)
                cancelEdit()
              }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="folder-tree-content">
        {folders.length === 0 ? (
          <div className="folder-tree-empty">No folders</div>
        ) : (
          folders.map((folder) => renderFolder(folder, 0, folders))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'folder' && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  const folder = getAllFoldersFlat(folders).find(f => f.id === contextMenu.id)
                  if (folder) {
                    handleEditFolder(folder, {} as React.MouseEvent)
                    setContextMenu(null)
                  }
                }}
              >
                ✏️ Edit Folder
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this folder? All subfolders and projects in it will be moved to root.')) {
                    handleDeleteFolder(contextMenu.id, {} as React.MouseEvent)
                    setContextMenu(null)
                  }
                }}
              >
                🗑️ Delete Folder
              </button>
            </>
          )}
          {contextMenu.type === 'project' && (
            <>
              <div className="context-menu-section">
                <div className="context-menu-label">Move to:</div>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    handleMoveProjectToFolder(contextMenu.id, null)
                    setContextMenu(null)
                  }}
                >
                  📂 Root
                </button>
                {getAllFoldersFlat(folders)
                  .filter(f => f.id)
                  .map((f) => (
                    <button
                      key={f.id}
                      className="context-menu-item"
                      onClick={() => {
                        handleMoveProjectToFolder(contextMenu.id, f.id!)
                        setContextMenu(null)
                      }}
                    >
                      📁 {f.name}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default FolderTree

