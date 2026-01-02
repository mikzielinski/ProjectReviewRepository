import { useEffect, useState } from 'react'
import api from '../services/api'
import './Tabs.css'

interface User {
  id: string
  name: string
  email: string
}

interface Task {
  id: string
  task_type: string
  title: string
  description?: string
  raci_stage?: string
  raci_task_name?: string
  assigned_to_user_id?: string
  assigned_to_name?: string
  reviewer_id?: string
  reviewer_name?: string
  required_role?: string
  estimated_time_hours?: number
  actual_time_hours?: number
  status: string
  priority: string
  due_at?: string
  created_at: string
  completed_at?: string
  verified_at?: string
  is_blocking: boolean
}

interface RACIData {
  stages: Array<{
    stage: string
    tasks: Array<{
      task: string
      roles: Record<string, string>
    }>
  }>
}

interface TasksTabProps {
  projectId: string
}

const TasksTab = ({ projectId }: TasksTabProps) => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [raciData, setRaciData] = useState<RACIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [generateOptions, setGenerateOptions] = useState({
    task_type: 'GENERAL',
    task_prefix: '',
    priority: 'NORMAL'
  })
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  
  // Form state
  const [formData, setFormData] = useState({
    task_type: 'UPLOAD_DOCUMENT',
    title: '',
    description: '',
    raci_stage: '',
    raci_task_name: '',
    assigned_to_user_id: '',
    required_role: '',
    estimated_time_hours: '',
    due_at: '',
    priority: 'NORMAL',
    is_blocking: false
  })

  useEffect(() => {
    loadData()
  }, [projectId])

  useEffect(() => {
    if (statusFilter !== 'all' || stageFilter !== 'all') {
      loadTasks()
    }
  }, [statusFilter, stageFilter])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showGenerateModal) {
        setShowGenerateModal(false)
      }
    }
    
    if (showGenerateModal) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [showGenerateModal])

  const loadData = async () => {
    try {
      await Promise.all([
        loadTasks(),
        loadUsers(),
        loadRACI()
      ])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTasks = async () => {
    try {
      const params: any = {}
      if (statusFilter !== 'all') {
        params.status = statusFilter
      }
      if (stageFilter !== 'all') {
        params.stage = stageFilter
      }
      
      console.log('Loading tasks with params:', params)
      const response = await api.get(`/projects/${projectId}/tasks`, { params })
      console.log('Tasks loaded:', response.data)
      console.log('Tasks count:', response.data?.length || 0)
      console.log('Tasks type:', typeof response.data, Array.isArray(response.data))
      if (Array.isArray(response.data)) {
        setTasks(response.data)
      } else {
        console.error('Tasks response is not an array:', response.data)
        setTasks([])
      }
    } catch (error) {
      console.error('Failed to load tasks:', error)
      setTasks([]) // Set empty array on error
    }
  }

  const loadUsers = async () => {
    try {
      const response = await api.get('/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const loadRACI = async () => {
    try {
      const response = await api.get(`/projects/${projectId}/raci`)
      // Handle both response formats
      if (response.data.raci_matrix) {
        setRaciData(response.data.raci_matrix)
      } else if (response.data) {
        setRaciData(response.data)
      }
    } catch (error) {
      console.error('Failed to load RACI:', error)
      setRaciData(null)
    }
  }

  const handleStageChange = (stage: string) => {
    setSelectedStage(stage)
    setSelectedTask('')
    setFormData({ ...formData, raci_stage: stage, raci_task_name: '' })
  }

  const handleTaskChange = (task: string) => {
    setSelectedTask(task)
    setFormData({ ...formData, raci_task_name: task })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const payload = {
        ...formData,
        assigned_to_user_id: formData.assigned_to_user_id || null,
        estimated_time_hours: formData.estimated_time_hours ? parseInt(formData.estimated_time_hours) : null,
        due_at: formData.due_at || null
      }
      
      await api.post(`/projects/${projectId}/tasks`, payload)
      setShowCreateForm(false)
      setFormData({
        task_type: 'UPLOAD_DOCUMENT',
        title: '',
        description: '',
        raci_stage: '',
        raci_task_name: '',
        assigned_to_user_id: '',
        required_role: '',
        estimated_time_hours: '',
        due_at: '',
        priority: 'NORMAL',
        is_blocking: false
      })
      setSelectedStage('')
      setSelectedTask('')
      loadTasks()
      alert('Task created successfully!')
    } catch (error: any) {
      console.error('Failed to create task:', error)
      alert(error.response?.data?.detail || 'Failed to create task')
    }
  }

  const handleEdit = (task: Task) => {
    setEditingTask(task)
    setFormData({
      task_type: task.task_type,
      title: task.title,
      description: task.description || '',
      raci_stage: task.raci_stage || '',
      raci_task_name: task.raci_task_name || '',
      assigned_to_user_id: task.assigned_to_user_id || '',
      required_role: task.required_role || '',
      estimated_time_hours: task.estimated_time_hours?.toString() || '',
      due_at: task.due_at ? new Date(task.due_at).toISOString().split('T')[0] : '',
      priority: task.priority,
      is_blocking: task.is_blocking
    })
    setSelectedStage(task.raci_stage || '')
    setSelectedTask(task.raci_task_name || '')
    setShowCreateForm(true)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask) return

    try {
      const updatePayload: any = {
        title: formData.title,
        description: formData.description || null,
        status: editingTask.status, // Keep current status unless explicitly changed
        priority: formData.priority,
        is_blocking: formData.is_blocking
      }

      if (formData.assigned_to_user_id) {
        updatePayload.assigned_to_user_id = formData.assigned_to_user_id
      } else {
        updatePayload.assigned_to_user_id = null
      }

      if (formData.estimated_time_hours) {
        updatePayload.estimated_time_hours = parseInt(formData.estimated_time_hours)
      } else {
        updatePayload.estimated_time_hours = null
      }

      if (formData.due_at) {
        updatePayload.due_at = new Date(formData.due_at).toISOString()
      } else {
        updatePayload.due_at = null
      }

      await api.put(`/projects/${projectId}/tasks/${editingTask.id}`, updatePayload)
      await loadTasks()
      setShowCreateForm(false)
      setEditingTask(null)
      setFormData({
        task_type: 'UPLOAD_DOCUMENT',
        title: '',
        description: '',
        raci_stage: '',
        raci_task_name: '',
        assigned_to_user_id: '',
        required_role: '',
        estimated_time_hours: '',
        due_at: '',
        priority: 'NORMAL',
        is_blocking: false
      })
      setSelectedStage('')
      setSelectedTask('')
    } catch (error) {
      console.error('Failed to update task:', error)
      alert('Failed to update task. Please try again.')
    }
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return
    }

    try {
      await api.delete(`/projects/${projectId}/tasks/${taskId}`)
      await loadTasks()
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert('Failed to delete task. Please try again.')
    }
  }

  const handleReview = async (taskId: string, action: string) => {
    try {
      await api.post(`/projects/${projectId}/tasks/${taskId}/review`, { action })
      loadTasks()
      alert(`Task ${action.toLowerCase()}d successfully!`)
    } catch (error: any) {
      console.error('Failed to review task:', error)
      alert(error.response?.data?.detail || 'Failed to review task')
    }
  }

  const handleFixExistingTasks = async () => {
    if (!confirm('This will update all existing RACI-generated tasks to match the new naming rules and remove duplicates. Continue?')) {
      return
    }

    try {
      const response = await api.post(`/projects/${projectId}/tasks/fix-raci-tasks`)
      const result = response.data
      let message = `Removed ${result.duplicate_count || 0} duplicate(s), updated ${result.updated_count} task(s)`
      if (result.skipped_count > 0) {
        message += `, skipped ${result.skipped_count} task(s)`
      }
      alert(message)
      await loadTasks()
    } catch (error: any) {
      console.error('Failed to fix tasks:', error)
      alert(error.response?.data?.detail || 'Failed to fix tasks. Please try again.')
    }
  }

  const handleGenerateTasks = async () => {
    if (!raciData || !raciData.stages || raciData.stages.length === 0) {
      alert('RACI matrix not available')
      return
    }

    setGenerating(true)
    try {
      console.log('Sending generate tasks request:', generateOptions)
      const response = await api.post(`/projects/${projectId}/tasks/generate-from-raci`, generateOptions)
      
      console.log('Generate tasks response:', response.data)
      const result = response.data
      setShowGenerateModal(false)
      setGenerating(false)
      
      let message = `Generated ${result.created_count || 0} task(s)`
      if (result.skipped_count > 0) {
        message += `, skipped ${result.skipped_count} (already exist)`
      }
      if (result.created_tasks && result.created_tasks.length > 0) {
        console.log('Created tasks:', result.created_tasks)
      }
      alert(message)
      
      // Reload tasks after a short delay to ensure backend has committed
      setTimeout(() => {
        loadTasks()
      }, 500)
    } catch (error: any) {
      console.error('Failed to generate tasks:', error)
      console.error('Error response:', error.response)
      console.error('Error response data:', error.response?.data)
      console.error('Error response status:', error.response?.status)
      const errorMessage = error.response?.data?.detail 
        ? (Array.isArray(error.response.data.detail) 
            ? JSON.stringify(error.response.data.detail, null, 2)
            : error.response.data.detail)
        : error.message || 'Failed to generate tasks'
      alert(`Error: ${errorMessage}`)
      setGenerating(false)
    }
  }

  const getAvailableTasks = () => {
    if (!raciData || !raciData.stages || !selectedStage) return []
    const stage = raciData.stages.find(s => s.stage === selectedStage)
    return stage ? stage.tasks.map(t => t.task) : []
  }

  const getStages = () => {
    if (!raciData || !raciData.stages) return []
    const stages = raciData.stages.map(s => s.stage)
    // Sort stages in correct order: Discovery, Design, Implementation, Run
    const stageOrder = ['Discovery', 'Design', 'Implementation', 'Run']
    return stages.sort((a, b) => {
      const indexA = stageOrder.indexOf(a)
      const indexB = stageOrder.indexOf(b)
      // If both are in the order list, sort by their position
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB
      }
      // If only one is in the order list, prioritize it
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      // If neither is in the order list, sort alphabetically
      return a.localeCompare(b)
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return '#3498db'
      case 'IN_PROGRESS': return '#f39c12'
      case 'COMPLETED': return '#27ae60'
      case 'VERIFIED': return '#2ecc71'
      case 'BLOCKED': return '#e74c3c'
      case 'CLOSED': return '#95a5a6'
      default: return '#95a5a6'
    }
  }

  if (loading) {
    return <div className="loading">Loading tasks...</div>
  }

  const getTaskOrderForStage = (stage: string): string[] => {
    // Get task order from RACI matrix for this stage
    if (!raciData || !raciData.stages) return []
    const stageData = raciData.stages.find(s => s.stage === stage)
    if (!stageData || !stageData.tasks) return []
    return stageData.tasks.map(t => t.task)
  }

  const filteredTasks = tasks.filter(task => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (stageFilter !== 'all' && task.raci_stage !== stageFilter) return false
    return true
  }).sort((a, b) => {
    // First sort by stage (using stage order)
    const stageOrder = ['Discovery', 'Design', 'Implementation', 'Run']
    const stageIndexA = stageOrder.indexOf(a.raci_stage || '')
    const stageIndexB = stageOrder.indexOf(b.raci_stage || '')
    
    if (stageIndexA !== stageIndexB) {
      if (stageIndexA === -1) return 1
      if (stageIndexB === -1) return -1
      return stageIndexA - stageIndexB
    }
    
    // If same stage, sort by task order from RACI
    if (a.raci_stage && b.raci_stage && a.raci_stage === b.raci_stage) {
      const taskOrder = getTaskOrderForStage(a.raci_stage)
      if (taskOrder.length > 0 && a.raci_task_name && b.raci_task_name) {
        const taskIndexA = taskOrder.indexOf(a.raci_task_name)
        const taskIndexB = taskOrder.indexOf(b.raci_task_name)
        
        if (taskIndexA !== -1 && taskIndexB !== -1) {
          return taskIndexA - taskIndexB
        }
        if (taskIndexA !== -1) return -1
        if (taskIndexB !== -1) return 1
      }
      
      // If tasks don't have raci_task_name or not in RACI, sort by title
      return (a.title || '').localeCompare(b.title || '')
    }
    
    // If no stage, sort by title
    return (a.title || '').localeCompare(b.title || '')
  })
  
  console.log('Tasks state:', tasks)
  console.log('Filtered tasks:', filteredTasks)
  console.log('Status filter:', statusFilter, 'Stage filter:', stageFilter)

  return (
    <>
      {/* Generate from RACI Modal - rendered outside tab-panel */}
      {showGenerateModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowGenerateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-title">Generate Tasks from RACI Matrix</h3>
            {!raciData || !raciData.stages || raciData.stages.length === 0 ? (
              <div>
                <p className="text-error">RACI matrix not available. Please configure RACI matrix first.</p>
                <div className="modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowGenerateModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="modal-body">
                  <p className="text-muted">
                    This will create tasks for all roles marked as Responsible (R) or Accountable (A) 
                    in the RACI matrix. Tasks that already exist will be skipped.
                  </p>
            
                  <div className="form-group">
                    <label>Task Type</label>
                    <select
                      value={generateOptions.task_type}
                      onChange={(e) => setGenerateOptions({ ...generateOptions, task_type: e.target.value })}
                      className="form-input"
                    >
                      <option value="GENERAL">General</option>
                      <option value="UPLOAD_DOCUMENT">Upload Document</option>
                      <option value="REVIEW">Review</option>
                      <option value="APPROVAL">Approval</option>
                      <option value="DEVELOPMENT">Development</option>
                      <option value="TESTING">Testing</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Task Prefix (optional)</label>
                    <input
                      type="text"
                      value={generateOptions.task_prefix}
                      onChange={(e) => setGenerateOptions({ ...generateOptions, task_prefix: e.target.value })}
                      className="form-input"
                      placeholder="e.g., [Auto] "
                    />
                  </div>

                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={generateOptions.priority}
                      onChange={(e) => setGenerateOptions({ ...generateOptions, priority: e.target.value })}
                      className="form-input"
                    >
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>

                  {raciData && raciData.stages && (
                    <div className="form-group preview-group">
                      <label>Preview:</label>
                      <div className="generate-preview">
                        <ul>
                          {raciData.stages.map((stage: any, stageIdx: number) => 
                            stage.tasks.map((task: any, taskIdx: number) => {
                              const responsibleRoles = Object.entries(task.roles || {})
                                .filter(([_, value]) => value === 'R' || value === 'A')
                                .map(([role, value]) => `${role} (${value})`)
                              if (responsibleRoles.length > 0) {
                                return (
                                  <li key={`${stage.stage}-${task.task}-${stageIdx}-${taskIdx}`}>
                                    <strong>{stage.stage}</strong> / <strong>{task.task}</strong>: {responsibleRoles.join(', ')}
                                  </li>
                                )
                              }
                              return null
                            }).filter(Boolean)
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerateTasks}
                    disabled={generating}
                  >
                    {generating ? 'Generating...' : 'Generate Tasks'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowGenerateModal(false)}
                    disabled={generating}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="tab-panel">
        <div className="panel-header">
          <h2>Tasks</h2>
          <div className="action-buttons">
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowGenerateModal(true)}
              title="Generate tasks from RACI matrix"
            >
              ⚡ Generate from RACI
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleFixExistingTasks}
              title="Fix existing RACI tasks to match new naming rules"
            >
              🔧 Fix Existing Tasks
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
              + Create Task
            </button>
          </div>
        </div>

      {/* Filters */}
      <div className="filters-bar">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="VERIFIED">Verified</option>
          <option value="BLOCKED">Blocked</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Stages</option>
          {raciData && raciData.stages && getStages().map(stage => (
            <option key={stage} value={stage}>{stage}</option>
          ))}
        </select>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="create-form">
          <h3>{editingTask ? 'Edit Task' : 'Create New Task'}</h3>
          <form onSubmit={editingTask ? handleUpdate : handleSubmit}>
            {!editingTask && (
              <div className="form-group">
                <label>Task Type *</label>
                <select
                  value={formData.task_type}
                  onChange={(e) => setFormData({ ...formData, task_type: e.target.value })}
                  required
                >
                  <option value="UPLOAD_DOCUMENT">Upload Document</option>
                  <option value="REVIEW">Review</option>
                  <option value="APPROVAL">Approval</option>
                  <option value="DEVELOPMENT">Development</option>
                  <option value="TESTING">Testing</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
            )}
            {editingTask && (
              <div className="form-group">
                <label>Task Type</label>
                <input type="text" value={formData.task_type} disabled />
              </div>
            )}

            {/* RACI fields are optional - show if available */}
            {raciData && raciData.stages && raciData.stages.length > 0 ? (
              <>
                <div className="form-group">
                  <label>RACI Stage (optional)</label>
                  <select
                    value={selectedStage}
                    onChange={(e) => handleStageChange(e.target.value)}
                  >
                    <option value="">None - General Task</option>
                    {getStages().map(stage => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </div>

                {selectedStage && (
                  <div className="form-group">
                    <label>RACI Task (optional)</label>
                    <select
                      value={selectedTask}
                      onChange={(e) => handleTaskChange(e.target.value)}
                    >
                      <option value="">None</option>
                      {getAvailableTasks().map(task => (
                        <option key={task} value={task}>{task}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <div className="form-group">
                <p className="text-muted">RACI matrix not configured. You can still create tasks without RACI assignment.</p>
              </div>
            )}

            <div className="form-group">
              <label>Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Task title"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                placeholder="Task description"
              />
            </div>

            <div className="form-group">
              <label>Assign To</label>
              <select
                value={formData.assigned_to_user_id}
                onChange={(e) => setFormData({ ...formData, assigned_to_user_id: e.target.value })}
              >
                <option value="">Select user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Estimated Time (hours)</label>
              <input
                type="number"
                value={formData.estimated_time_hours}
                onChange={(e) => setFormData({ ...formData, estimated_time_hours: e.target.value })}
                min="0"
                placeholder="e.g., 8"
              />
            </div>

            <div className="form-group">
              <label>Due Date</label>
              <input
                type="date"
                value={formData.due_at}
                onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.is_blocking}
                  onChange={(e) => setFormData({ ...formData, is_blocking: e.target.checked })}
                />
                Is Blocking
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingTask ? 'Update Task' : 'Create Task'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateForm(false)
                  setEditingTask(null)
                  setFormData({
                    task_type: 'UPLOAD_DOCUMENT',
                    title: '',
                    description: '',
                    raci_stage: '',
                    raci_task_name: '',
                    assigned_to_user_id: '',
                    required_role: '',
                    estimated_time_hours: '',
                    due_at: '',
                    priority: 'NORMAL',
                    is_blocking: false
                  })
                  setSelectedStage('')
                  setSelectedTask('')
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tasks List */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Stage/Task</th>
              <th>Type</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Estimated Time</th>
              <th>Due Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  No tasks found
                </td>
              </tr>
            ) : (
              filteredTasks.map(task => (
                <tr key={task.id}>
                  <td>
                    <strong>{task.title}</strong>
                    {task.description && (
                      <div className="task-description">{task.description}</div>
                    )}
                  </td>
                  <td>
                    {task.raci_stage && task.raci_task_name ? (
                      <div>
                        <div><strong>{task.raci_stage}</strong></div>
                        <div>{task.raci_task_name}</div>
                      </div>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td>
                    <span className="badge">{task.task_type}</span>
                  </td>
                  <td>
                    {task.assigned_to_name || <span className="text-muted">Unassigned</span>}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ backgroundColor: getStatusColor(task.status) }}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td>
                    {task.estimated_time_hours ? `${task.estimated_time_hours}h` : '-'}
                  </td>
                  <td>
                    {task.due_at ? new Date(task.due_at).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleEdit(task)}
                        title="Edit task"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(task.id)}
                        title="Delete task"
                      >
                        🗑️ Delete
                      </button>
                      {task.status === 'COMPLETED' && !task.verified_at && (
                        <>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleReview(task.id, 'APPROVE')}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleReview(task.id, 'REQUEST_CHANGES')}
                          >
                            Request Changes
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleReview(task.id, 'REJECT')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  )
}

export default TasksTab

