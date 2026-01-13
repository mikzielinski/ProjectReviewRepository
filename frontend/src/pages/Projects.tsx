import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../services/api'
import ProjectSetupWizard from '../components/ProjectSetupWizard'
import './Projects.css'

interface Project {
  id: string
  key: string
  name: string
  status: string
  created_at: string
}

interface Task {
  id: string
  title: string
  status: string
  project_id: string
  project_name?: string
  due_at?: string
  priority: string
  task_type?: string
  description?: string
}

const Projects = () => {
  const [myProjects, setMyProjects] = useState<Project[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({ key: '', name: '', status: 'ACTIVE', folder_id: '' })
  const [folders, setFolders] = useState<any[]>([])
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [updatingTask, setUpdatingTask] = useState(false)
  const [taskUpdateComment, setTaskUpdateComment] = useState('')
  const [taskFile, setTaskFile] = useState<File | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardProject, setWizardProject] = useState<Project | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
    loadFolders()
  }, [])

  const loadFolders = async () => {
    try {
      const response = await api.get('/folders')
      setFolders(response.data || [])
    } catch (error) {
      console.error('Failed to load folders:', error)
    }
  }

  const getAllFoldersFlat = (folders: any[]): any[] => {
    const result: any[] = []
    folders.forEach(folder => {
      if (folder.id) {
        result.push(folder)
      }
      if (folder.subfolders && folder.subfolders.length > 0) {
        result.push(...getAllFoldersFlat(folder.subfolders))
      }
    })
    return result
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    
    setCreatingFolder(true)
    try {
      await api.post('/folders', {
        name: newFolderName.trim(),
        parent_folder_id: newFolderParent || null
      })
      setNewFolderName('')
      setNewFolderParent(null)
      setShowCreateFolder(false)
      await loadFolders()
      // Auto-select the newly created folder
      const updatedFolders = await api.get('/folders')
      const allFolders = getAllFoldersFlat(updatedFolders.data || [])
      const newFolder = allFolders.find(f => f.name === newFolderName.trim())
      if (newFolder) {
        setFormData({ ...formData, folder_id: newFolder.id })
      }
    } catch (error: any) {
      console.error('Failed to create folder:', error)
      alert(error.response?.data?.detail || 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      console.log('Loading my projects and tasks...')
      const [projectsRes, tasksRes] = await Promise.all([
        api.get('/projects/my-projects').catch(err => {
          console.error('Error loading projects:', err)
          return { data: [] }
        }),
        api.get('/projects/my-tasks').catch(err => {
          console.error('Error loading tasks:', err)
          return { data: [] }
        })
      ])
      console.log('Projects response:', projectsRes.data)
      console.log('Tasks response:', tasksRes.data)
      setMyProjects(projectsRes.data || [])
      setMyTasks(tasksRes.data || [])
    } catch (err: any) {
      console.error('Failed to load data:', err)
      if (err.response?.status === 401) {
        navigate('/login')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = () => {
    loadData()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    // Open wizard instead of direct create
    setShowWizard(true)
    setShowCreateForm(false)
  }

  const handleWizardComplete = async (projectData: any) => {
    try {
      setCreating(true)
      let projectId: string | null = null
      if (wizardProject) {
        // Update existing project
        await api.put(`/projects/${wizardProject.id}`, projectData)
        projectId = wizardProject.id
      } else {
        // Create new project
        const response = await api.post('/projects', projectData)
        projectId = response.data.id
      }
      setShowWizard(false)
      setWizardProject(null)
      setFormData({ key: '', name: '', status: 'ACTIVE', folder_id: '' })
      loadProjects()
      loadFolders()
      
      // Navigate to project detail page
      if (projectId) {
        navigate(`/projects/${projectId}`)
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || `Failed to ${wizardProject ? 'update' : 'create'} project`)
    } finally {
      setCreating(false)
    }
  }

  const handleWizardCancel = () => {
    setShowWizard(false)
    setWizardProject(null)
  }

  const handleEdit = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    // Open wizard for editing
    setWizardProject(project)
    setShowWizard(true)
    setShowCreateForm(false)
    setEditingProject(null)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject) return
    
    setUpdating(true)
    try {
      await api.put(`/projects/${editingProject.id}`, {
        name: formData.name,
        status: formData.status,
      })
      setEditingProject(null)
      setFormData({ key: '', name: '', status: 'ACTIVE', folder_id: '' })
      loadProjects()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update project')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return
    try {
      await api.delete(`/projects/${projectId}`)
      loadProjects()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete project')
    }
  }

  const cancelEdit = () => {
    setEditingProject(null)
    setFormData({ key: '', name: '', status: 'ACTIVE', folder_id: '' })
    setShowCreateFolder(false)
    setNewFolderName('')
    setNewFolderParent(null)
  }

  console.log('Projects component render:', { myProjects, myTasks, loading, projectsCount: myProjects.length, tasksCount: myTasks.length })

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading projects...</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="projects-page">
        <div className="page-header">
          <h1>My Projects & Tasks</h1>
          <button 
            className="btn btn-primary"
            onClick={() => {
              setShowWizard(true)
              setWizardProject(null)
              setShowCreateForm(false)
              setEditingProject(null)
            }}
          >
            + New Project
          </button>
        </div>

        {(showCreateForm || editingProject) && (
          <div className="create-form">
            <h3>{editingProject ? 'Edit Project' : 'Create New Project'}</h3>
            <form onSubmit={editingProject ? handleUpdate : handleCreate}>
              {!editingProject && (
                <div className="form-group">
                  <label>Project Key</label>
                  <input
                    type="text"
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                    required
                    placeholder="e.g., PROJ-001"
                    disabled={!!editingProject}
                  />
                </div>
              )}
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Project Name"
                />
              </div>
              {!editingProject && (
                <div className="form-group">
                  <label>Folder (Path)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <select
                      value={formData.folder_id}
                      onChange={(e) => setFormData({ ...formData, folder_id: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      <option value="">Root (no folder)</option>
                      {getAllFoldersFlat(folders)
                        .filter(f => f.id)
                        .map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowCreateFolder(!showCreateFolder)}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      + New Folder
                    </button>
                  </div>
                  {showCreateFolder && (
                    <div style={{ marginTop: '10px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="New folder name"
                        style={{ width: '100%', marginBottom: '8px', padding: '6px' }}
                      />
                      <select
                        value={newFolderParent || ''}
                        onChange={(e) => setNewFolderParent(e.target.value || null)}
                        style={{ width: '100%', marginBottom: '8px', padding: '6px' }}
                      >
                        <option value="">Root (no parent)</option>
                        {getAllFoldersFlat(folders)
                          .filter(f => f.id)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                      </select>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleCreateFolder}
                          disabled={creatingFolder || !newFolderName.trim()}
                          style={{ flex: 1 }}
                        >
                          {creatingFolder ? 'Creating...' : 'Create Folder'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setShowCreateFolder(false)
                            setNewFolderName('')
                            setNewFolderParent(null)
                          }}
                          style={{ flex: 1 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {editingProject && (
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    required
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              )}
              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={creating || updating}
                >
                  {editingProject 
                    ? (updating ? 'Updating...' : 'Update')
                    : (creating ? 'Creating...' : 'Create')
                  }
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false)
                    cancelEdit()
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* My Projects Section */}
        <div className="section">
          <h2>My Projects</h2>
          <div className="projects-grid">
            {!loading && myProjects.length === 0 ? (
              <div className="empty-state">
                <p>No projects assigned to you.</p>
              </div>
            ) : (
              myProjects.map((project) => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="project-header">
                  <h3>{project.name}</h3>
                  <span className={`status-badge status-${project.status.toLowerCase()}`}>
                    {project.status}
                  </span>
                </div>
                <div className="project-details">
                  <p className="project-key">Key: {project.key}</p>
                  <p className="project-date">
                    Created: {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="project-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => handleEdit(project, e)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => handleDelete(project.id, e)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        </div>

        {/* My Tasks Section */}
        <div className="section">
          <h2>My Tasks</h2>
          <div className="tasks-list">
            {!loading && myTasks.length === 0 ? (
              <div className="empty-state">
                <p>No tasks assigned to you.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                        {task.description && (
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                            {task.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge status-${task.status.toLowerCase().replace('_', '-')}`}>
                          {task.status.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`badge priority-${task.priority.toLowerCase()}`}>
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td>
                        {task.due_at ? new Date(task.due_at).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => navigate(`/projects/${task.project_id}`)}
                          >
                            View Project
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setEditingTask(task)
                              setTaskUpdateComment('')
                              setTaskFile(null)
                              setShowTaskModal(true)
                            }}
                            title="Edit task"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Task Edit Modal */}
        {showTaskModal && editingTask && (
          <div className="modal-overlay" onClick={() => {
            if (!updatingTask) {
              setShowTaskModal(false)
              setEditingTask(null)
              setTaskUpdateComment('')
              setTaskFile(null)
            }
          }}>
            <div className="modal-content task-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit Task: {editingTask.title}</h2>
                <button
                  className="modal-close"
                  onClick={() => {
                    if (!updatingTask) {
                      setShowTaskModal(false)
                      setEditingTask(null)
                      setTaskUpdateComment('')
                      setTaskFile(null)
                    }
                  }}
                  disabled={updatingTask}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingTask.status}
                    onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}
                    className="form-control"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="CLOSED">Closed</option>
                    <option value="BLOCKED">Blocked</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select
                    value={editingTask.priority}
                    onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })}
                    className="form-control"
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={editingTask.due_at ? new Date(editingTask.due_at).toISOString().split('T')[0] : ''}
                    onChange={(e) => setEditingTask({ 
                      ...editingTask, 
                      due_at: e.target.value ? new Date(e.target.value).toISOString() : undefined 
                    })}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Update Comment (for PM)</label>
                  <textarea
                    value={taskUpdateComment}
                    onChange={(e) => setTaskUpdateComment(e.target.value)}
                    className="form-control"
                    rows={4}
                    placeholder="Describe your progress, changes, or any notes for the Project Manager..."
                  />
                </div>

                <div className="form-group">
                  <label>Upload File (for Reviewer/Approver)</label>
                  <input
                    type="file"
                    onChange={(e) => setTaskFile(e.target.files?.[0] || null)}
                    className="form-control"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                  />
                  {taskFile && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                      Selected: {taskFile.name} ({(taskFile.size / 1024).toFixed(2)} KB)
                    </div>
                  )}
                </div>

                {/* Approval Flow Buttons */}
                {(editingTask.task_type === 'REVIEW' || editingTask.task_type === 'APPROVAL') && (
                  <div className="form-group">
                    <label>Approval Actions</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-success"
                        onClick={async () => {
                          setUpdatingTask(true)
                          try {
                            await api.put(`/projects/${editingTask.project_id}/tasks/${editingTask.id}`, {
                              status: 'COMPLETED',
                              priority: editingTask.priority,
                              due_at: editingTask.due_at
                            })
                            setShowTaskModal(false)
                            setEditingTask(null)
                            setTaskUpdateComment('')
                            setTaskFile(null)
                            loadData()
                            alert('Task approved successfully!')
                          } catch (err: any) {
                            alert(err.response?.data?.detail || 'Failed to approve task')
                          } finally {
                            setUpdatingTask(false)
                          }
                        }}
                        disabled={updatingTask}
                      >
                        ✓ Approve
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={async () => {
                          if (!confirm('Are you sure you want to reject this task?')) return
                          setUpdatingTask(true)
                          try {
                            await api.put(`/projects/${editingTask.project_id}/tasks/${editingTask.id}`, {
                              status: 'BLOCKED',
                              priority: editingTask.priority,
                              due_at: editingTask.due_at
                            })
                            setShowTaskModal(false)
                            setEditingTask(null)
                            setTaskUpdateComment('')
                            setTaskFile(null)
                            loadData()
                            alert('Task rejected.')
                          } catch (err: any) {
                            alert(err.response?.data?.detail || 'Failed to reject task')
                          } finally {
                            setUpdatingTask(false)
                          }
                        }}
                        disabled={updatingTask}
                      >
                        ✗ Reject
                      </button>
                      <button
                        className="btn btn-warning"
                        onClick={async () => {
                          setUpdatingTask(true)
                          try {
                            await api.put(`/projects/${editingTask.project_id}/tasks/${editingTask.id}`, {
                              status: 'OPEN',
                              priority: editingTask.priority,
                              due_at: editingTask.due_at
                            })
                            setShowTaskModal(false)
                            setEditingTask(null)
                            setTaskUpdateComment('')
                            setTaskFile(null)
                            loadData()
                            alert('Changes requested. Task sent back for revision.')
                          } catch (err: any) {
                            alert(err.response?.data?.detail || 'Failed to request changes')
                          } finally {
                            setUpdatingTask(false)
                          }
                        }}
                        disabled={updatingTask}
                      >
                        ↻ Request Changes
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!updatingTask) {
                      setShowTaskModal(false)
                      setEditingTask(null)
                      setTaskUpdateComment('')
                      setTaskFile(null)
                    }
                  }}
                  disabled={updatingTask}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    setUpdatingTask(true)
                    try {
                      await api.put(`/projects/${editingTask.project_id}/tasks/${editingTask.id}`, {
                        status: editingTask.status,
                        priority: editingTask.priority,
                        due_at: editingTask.due_at
                      })
                      setShowTaskModal(false)
                      setEditingTask(null)
                      setTaskUpdateComment('')
                      setTaskFile(null)
                      loadData()
                    } catch (err: any) {
                      alert(err.response?.data?.detail || 'Failed to update task')
                    } finally {
                      setUpdatingTask(false)
                    }
                  }}
                  disabled={updatingTask}
                >
                  {updatingTask ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Project Setup Wizard */}
        {showWizard && (
          <ProjectSetupWizard
            project={wizardProject || undefined}
            onComplete={handleWizardComplete}
            onCancel={handleWizardCancel}
          />
        )}
      </div>
    </Layout>
  )
}

export default Projects
