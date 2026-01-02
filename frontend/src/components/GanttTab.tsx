import { useEffect, useState } from 'react'
import api from '../services/api'
import './Tabs.css'
import './GanttTab.css'

interface Task {
  id: string
  title: string
  raci_stage?: string
  raci_task_name?: string
  assigned_to_name?: string
  status: string
  estimated_time_hours?: number
  actual_time_hours?: number
  due_at?: string
  created_at: string
  completed_at?: string
}

interface GanttTabProps {
  projectId: string
}

const GanttTab = ({ projectId }: GanttTabProps) => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [raciData, setRaciData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadData()
  }, [projectId, statusFilter])

  const loadRACI = async () => {
    try {
      const response = await api.get(`/projects/${projectId}/raci`)
      if (response.data && response.data.raci_matrix) {
        setRaciData(response.data.raci_matrix)
      }
    } catch (error) {
      console.error('Failed to load RACI:', error)
    }
  }

  const loadTasks = async () => {
    try {
      const params: any = {}
      if (statusFilter !== 'all') {
        params.status = statusFilter
      }
      
      const response = await api.get(`/projects/${projectId}/tasks`, { params })
      setTasks(response.data)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadTasks(), loadRACI()])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleStage = (stage: string) => {
    const newExpanded = new Set(expandedStages)
    if (newExpanded.has(stage)) {
      newExpanded.delete(stage)
    } else {
      newExpanded.add(stage)
    }
    setExpandedStages(newExpanded)
  }

  const getStages = () => {
    const stages = new Set<string>()
    tasks.forEach(task => {
      if (task.raci_stage) {
        stages.add(task.raci_stage)
      }
    })
    // Sort stages in correct order: Discovery, Design, Implementation, Run
    const stageOrder = ['Discovery', 'Design', 'Implementation', 'Run']
    const stageArray = Array.from(stages)
    return stageArray.sort((a, b) => {
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

  const getTaskOrderForStage = (stage: string): string[] => {
    // Get task order from RACI matrix for this stage
    if (!raciData || !raciData.stages) return []
    const stageData = raciData.stages.find((s: any) => s.stage === stage)
    if (!stageData || !stageData.tasks) return []
    return stageData.tasks.map((t: any) => t.task)
  }

  const getTasksForStage = (stage: string) => {
    const stageTasks = tasks.filter(task => task.raci_stage === stage)
    
    // Sort by RACI task order if available
    const taskOrder = getTaskOrderForStage(stage)
    
    return stageTasks.sort((a, b) => {
      if (taskOrder.length > 0 && a.raci_task_name && b.raci_task_name) {
        const taskIndexA = taskOrder.indexOf(a.raci_task_name)
        const taskIndexB = taskOrder.indexOf(b.raci_task_name)
        
        if (taskIndexA !== -1 && taskIndexB !== -1) {
          return taskIndexA - taskIndexB
        }
        if (taskIndexA !== -1) return -1
        if (taskIndexB !== -1) return 1
      }
      
      // Fallback: sort by title
      return (a.title || '').localeCompare(b.title || '')
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

  const getProgress = (task: Task) => {
    if (task.status === 'COMPLETED' || task.status === 'VERIFIED') return 100
    if (task.status === 'IN_PROGRESS') {
      if (task.estimated_time_hours && task.actual_time_hours) {
        return Math.min(100, Math.round((task.actual_time_hours / task.estimated_time_hours) * 100))
      }
      return 50
    }
    return 0
  }

  if (loading) {
    return <div className="loading">Loading Gantt chart...</div>
  }

  const stages = getStages()
  const tasksWithoutStage = tasks.filter(task => !task.raci_stage)

  return (
    <div className="tab-panel">
      <div className="panel-header">
        <h2>Gantt Chart</h2>
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
      </div>

      <div className="gantt-container">
        {stages.map(stage => {
          const stageTasks = getTasksForStage(stage)
          const isExpanded = expandedStages.has(stage)
          
          return (
            <div key={stage} className="gantt-stage">
              <div
                className="gantt-stage-header"
                onClick={() => toggleStage(stage)}
              >
                <span className="gantt-stage-toggle">{isExpanded ? '▼' : '▶'}</span>
                <span className="gantt-stage-name">{stage}</span>
                <span className="gantt-stage-count">({stageTasks.length} tasks)</span>
              </div>
              
              {isExpanded && (
                <div className="gantt-stage-tasks">
                  {stageTasks.map(task => (
                    <div key={task.id} className="gantt-task-row">
                      <div className="gantt-task-info">
                        <div className="gantt-task-title">{task.title}</div>
                        {task.raci_task_name && (
                          <div className="gantt-task-subtitle">{task.raci_task_name}</div>
                        )}
                        <div className="gantt-task-meta">
                          {task.assigned_to_name && (
                            <span className="gantt-task-assignee">👤 {task.assigned_to_name}</span>
                          )}
                          {task.estimated_time_hours && (
                            <span className="gantt-task-time">⏱ {task.estimated_time_hours}h</span>
                          )}
                          {task.due_at && (
                            <span className="gantt-task-due">📅 {new Date(task.due_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="gantt-task-bar-container">
                        <div
                          className="gantt-task-bar"
                          style={{
                            width: `${getProgress(task)}%`,
                            backgroundColor: getStatusColor(task.status)
                          }}
                        >
                          <span className="gantt-task-bar-label">
                            {getProgress(task)}%
                          </span>
                        </div>
                      </div>
                      <div className="gantt-task-status">
                        <span
                          className="badge"
                          style={{ backgroundColor: getStatusColor(task.status) }}
                        >
                          {task.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {tasksWithoutStage.length > 0 && (
          <div className="gantt-stage">
            <div className="gantt-stage-header">
              <span className="gantt-stage-name">Other Tasks</span>
              <span className="gantt-stage-count">({tasksWithoutStage.length} tasks)</span>
            </div>
            <div className="gantt-stage-tasks">
              {tasksWithoutStage.map(task => (
                <div key={task.id} className="gantt-task-row">
                  <div className="gantt-task-info">
                    <div className="gantt-task-title">{task.title}</div>
                    <div className="gantt-task-meta">
                      {task.assigned_to_name && (
                        <span className="gantt-task-assignee">👤 {task.assigned_to_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="gantt-task-bar-container">
                    <div
                      className="gantt-task-bar"
                      style={{
                        width: `${getProgress(task)}%`,
                        backgroundColor: getStatusColor(task.status)
                      }}
                    >
                      <span className="gantt-task-bar-label">
                        {getProgress(task)}%
                      </span>
                    </div>
                  </div>
                  <div className="gantt-task-status">
                    <span
                      className="badge"
                      style={{ backgroundColor: getStatusColor(task.status) }}
                    >
                      {task.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GanttTab

