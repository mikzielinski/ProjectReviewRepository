import { useEffect, useState } from 'react'
import api from '../services/api'
import './Tabs.css'
import './RACITab.css'

interface TeamMember {
  user: {
    id: string
    name: string
    email: string
  }
  role_code: string
  is_temporary: boolean
  expires_at: string | null
}

interface RACITask {
  task: string
  roles: Record<string, string> // role -> R/A/I
}

interface RACIStage {
  stage: string
  tasks: RACITask[]
}

interface RACIData {
  project_id: string
  raci_matrix: {
    stages: RACIStage[]
    role_assignments?: Record<string, string> // role -> user_id
  }
  team_members: Record<string, TeamMember>
}

interface RACITabProps {
  projectId: string
  onTeamUpdate?: () => void
}

const RACITab = ({ projectId, onTeamUpdate }: RACITabProps) => {
  const [raciData, setRaciData] = useState<RACIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddRole, setShowAddRole] = useState(false)
  const [showAddStage, setShowAddStage] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newStageName, setNewStageName] = useState('')
  const [newTaskName, setNewTaskName] = useState('')
  const [selectedStageForTask, setSelectedStageForTask] = useState<number | null>(null)

  useEffect(() => {
    loadRACI()
  }, [projectId])

  // Reload RACI when team is updated (triggered by parent component)
  useEffect(() => {
    if (projectId) {
      // Small delay to ensure backend has processed team changes
      const timer = setTimeout(() => {
        loadRACI()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [onTeamUpdate, projectId])

  const loadRACI = () => {
    setLoading(true)
    api
      .get(`/projects/${projectId}/raci`)
      .then((res) => {
        console.log('RACI data loaded:', res.data)
        // Handle different response formats
        if (res.data) {
          // Check if response has raci_matrix directly
          if (res.data.raci_matrix) {
            setRaciData(res.data)
          } 
          // Check if response is the raci_matrix itself
          else if (res.data.stages && Array.isArray(res.data.stages)) {
            setRaciData({
              project_id: projectId,
              raci_matrix: res.data,
              team_members: {}
            })
          }
          // Otherwise try to use default structure
          else {
            console.warn('Unexpected RACI data structure, using default:', res.data)
            // Try to construct valid structure
            const defaultMatrix = {
              stages: [],
              role_assignments: {}
            }
            setRaciData({
              project_id: projectId,
              raci_matrix: res.data.raci_matrix || defaultMatrix,
              team_members: res.data.team_members || {}
            })
          }
        } else {
          console.error('No RACI data in response:', res)
          setRaciData(null)
        }
      })
      .catch((err) => {
        console.error('Failed to load RACI:', err)
        console.error('Error details:', err.response?.data)
        setRaciData(null)
      })
      .finally(() => setLoading(false))
  }

  const handleSave = async () => {
    if (!raciData) return
    
    setSaving(true)
    try {
      await api.put(`/projects/${projectId}/raci`, {
        raci_matrix_json: raciData.raci_matrix
      })
      setEditing(false)
      alert('RACI matrix saved successfully!')
      loadRACI() // Reload to get fresh data
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save RACI matrix')
    } finally {
      setSaving(false)
    }
  }

  const handleCellChange = (stageIndex: number, taskIndex: number, role: string, value: string) => {
    if (!raciData) return
    
    const newData = { ...raciData }
    const task = newData.raci_matrix.stages[stageIndex].tasks[taskIndex]
    
    if (value === '') {
      delete task.roles[role]
    } else {
      task.roles[role] = value
    }
    
    setRaciData(newData)
  }

  const handleAddRole = () => {
    if (!raciData || !newRoleName.trim()) return
    
    // Check if role already exists in team
    const teamRoles = getTeamRoles()
    if (teamRoles.includes(newRoleName.trim())) {
      alert('This role already exists in the team. Please assign a team member to this role in the Team tab first.')
      setNewRoleName('')
      setShowAddRole(false)
      return
    }
    
    // Role will be added to RACI matrix when used in tasks
    // But we should suggest adding it to team first
    const newData = { ...raciData }
    setRaciData(newData)
    setNewRoleName('')
    setShowAddRole(false)
    alert(`Role "${newRoleName.trim()}" added. Remember to add a team member with this role in the Team tab.`)
  }

  const handleRemoveRole = (role: string) => {
    if (!raciData) return
    if (!confirm(`Are you sure you want to remove role "${role}" from all tasks?`)) return
    
    // Check if role is in team - if yes, warn user
    const teamRoles = getTeamRoles()
    if (teamRoles.includes(role)) {
      if (!confirm(`Role "${role}" is assigned to a team member. It will be removed from RACI matrix but will remain in the team. Continue?`)) {
        return
      }
    }
    
    const newData = { ...raciData }
    // Deep copy to ensure state update
    newData.raci_matrix = { ...newData.raci_matrix }
    newData.raci_matrix.stages = newData.raci_matrix.stages.map(stage => ({
      ...stage,
      tasks: stage.tasks.map(task => {
        const newTask = { ...task, roles: { ...task.roles } }
        delete newTask.roles[role]
        return newTask
      })
    }))
    
    // Also remove from role_assignments if exists
    if (newData.raci_matrix.role_assignments) {
      const newAssignments = { ...newData.raci_matrix.role_assignments }
      delete newAssignments[role]
      newData.raci_matrix.role_assignments = newAssignments
    }
    
    // Force React to re-render by creating completely new object
    setRaciData({ ...newData })
    console.log('Role removed:', role, 'New data:', newData)
  }

  const handleAddStage = () => {
    if (!raciData || !newStageName.trim()) return
    
    const newData = { ...raciData }
    newData.raci_matrix.stages.push({
      stage: newStageName.trim(),
      tasks: []
    })
    setRaciData(newData)
    setNewStageName('')
    setShowAddStage(false)
  }

  const handleRemoveStage = (stageIndex: number) => {
    if (!raciData) return
    const stage = raciData.raci_matrix.stages[stageIndex]
    if (!confirm(`Are you sure you want to remove stage "${stage.stage}" and all its tasks?`)) return
    
    const newData = { ...raciData }
    newData.raci_matrix.stages.splice(stageIndex, 1)
    setRaciData(newData)
  }

  const handleAddTask = () => {
    if (!raciData || !newTaskName.trim() || selectedStageForTask === null) return
    
    const newData = { ...raciData }
    newData.raci_matrix.stages[selectedStageForTask].tasks.push({
      task: newTaskName.trim(),
      roles: {}
    })
    setRaciData(newData)
    setNewTaskName('')
    setSelectedStageForTask(null)
    setShowAddTask(false)
  }

  const handleRemoveTask = (stageIndex: number, taskIndex: number) => {
    if (!raciData) return
    const task = raciData.raci_matrix.stages[stageIndex].tasks[taskIndex]
    if (!confirm(`Are you sure you want to remove task "${task.task}"?`)) return
    
    const newData = { ...raciData }
    newData.raci_matrix.stages[stageIndex].tasks.splice(taskIndex, 1)
    setRaciData(newData)
  }

  const getAllRoles = (): string[] => {
    if (!raciData) return []
    
    // Start with roles from team members (Team tab) - these are the primary roles
    const teamRoles = new Set<string>()
    Object.keys(raciData.team_members || {}).forEach(role => teamRoles.add(role))
    
    // Add roles that are used in RACI matrix but might not be in team yet
    // (for backward compatibility with existing RACI data)
    const raciRoles = new Set<string>()
    raciData.raci_matrix.stages.forEach(stage => {
      stage.tasks.forEach(task => {
        Object.keys(task.roles).forEach(role => raciRoles.add(role))
      })
    })
    
    // Combine: team roles first (priority), then RACI-only roles
    const allRoles = new Set([...teamRoles, ...raciRoles])
    return Array.from(allRoles).sort()
  }

  const getTeamRoles = (): string[] => {
    if (!raciData) return []
    return Object.keys(raciData.team_members || {}).sort()
  }

  const getAllTeamMembers = (): TeamMember[] => {
    if (!raciData) return []
    
    // Get all unique team members
    const memberMap = new Map<string, TeamMember>()
    Object.values(raciData.team_members || {}).forEach(member => {
      memberMap.set(member.user.id, member)
    })
    
    return Array.from(memberMap.values())
  }

  const getMembersForRole = (role: string): TeamMember[] => {
    if (!raciData) return []
    
    // Get members with this specific role
    const members: TeamMember[] = []
    Object.entries(raciData.team_members || {}).forEach(([memberRole, member]) => {
      if (memberRole === role) {
        members.push(member)
      }
    })
    
    // Also include all team members as potential assignments
    return members.length > 0 ? members : getAllTeamMembers()
  }

  const handleAssignRoleMember = (role: string, userId: string | null) => {
    if (!raciData) return
    
    const newData = { ...raciData }
    
    // Initialize role_assignments if it doesn't exist
    if (!newData.raci_matrix.role_assignments) {
      newData.raci_matrix.role_assignments = {}
    }
    
    if (userId) {
      newData.raci_matrix.role_assignments[role] = userId
    } else {
      delete newData.raci_matrix.role_assignments[role]
    }
    
    setRaciData(newData)
  }

  const getAssignedMemberForRole = (role: string): TeamMember | null => {
    if (!raciData) return null
    
    // First check role_assignments
    if (raciData.raci_matrix.role_assignments?.[role]) {
      const userId = raciData.raci_matrix.role_assignments[role]
      const member = getAllTeamMembers().find(m => m.user.id === userId)
      if (member) return member
    }
    
    // Fallback to team_members mapping
    return raciData.team_members[role] || null
  }

  if (loading) {
    return <div className="loading">Loading RACI matrix...</div>
  }

  if (!raciData) {
    return (
      <div className="tab-panel">
        <h2>RACI Matrix</h2>
        <div className="empty-state">RACI matrix not available. Please configure RACI matrix first.</div>
      </div>
    )
  }

  // Ensure raci_matrix exists
  if (!raciData.raci_matrix) {
    console.error('RACI matrix is missing:', raciData)
    return (
      <div className="tab-panel">
        <h2>RACI Matrix</h2>
        <div className="empty-state">
          RACI matrix data is missing. Please configure RACI matrix first.
        </div>
      </div>
    )
  }

  // Ensure stages array exists
  if (!raciData.raci_matrix.stages || !Array.isArray(raciData.raci_matrix.stages)) {
    console.error('Invalid RACI structure - missing stages:', raciData)
    // Initialize with empty stages if missing
    if (!raciData.raci_matrix.stages) {
      raciData.raci_matrix.stages = []
    }
    if (raciData.raci_matrix.stages.length === 0) {
      return (
        <div className="tab-panel">
          <h2>RACI Matrix</h2>
          <div className="empty-state">
            RACI matrix has no stages. Please add stages to the RACI matrix.
          </div>
        </div>
      )
    }
  }

  const allRoles = getAllRoles()

  return (
    <div className="tab-panel">
      <div className="panel-header">
        <h2>RACI Matrix</h2>
        <div className="panel-actions">
          {!editing ? (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              Edit RACI
            </button>
          ) : (
            <>
              <div className="edit-actions-group">
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAddStage(true)}
                  title="Add Stage"
                >
                  + Stage
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAddTask(true)}
                  title="Add Task"
                >
                  + Task
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAddRole(true)}
                  title="Add Role"
                >
                  + Role
                </button>
              </div>
              <div className="save-actions-group">
                <button 
                  className="btn btn-primary" 
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    loadRACI()
                    setEditing(false)
                    setShowAddRole(false)
                    setShowAddStage(false)
                    setShowAddTask(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Role Modal */}
      {showAddRole && (
        <div className="modal-overlay" onClick={() => setShowAddRole(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Role</h3>
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name (e.g., Senior Developer)"
              className="form-input"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddRole()
                } else if (e.key === 'Escape') {
                  setShowAddRole(false)
                }
              }}
            />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleAddRole}>
                Add
              </button>
              <button className="btn btn-secondary" onClick={() => {
                setShowAddRole(false)
                setNewRoleName('')
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stage Modal */}
      {showAddStage && (
        <div className="modal-overlay" onClick={() => setShowAddStage(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Stage</h3>
            <input
              type="text"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="Stage name (e.g., Testing)"
              className="form-input"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddStage()
                } else if (e.key === 'Escape') {
                  setShowAddStage(false)
                }
              }}
            />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleAddStage}>
                Add
              </button>
              <button className="btn btn-secondary" onClick={() => {
                setShowAddStage(false)
                setNewStageName('')
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="modal-overlay" onClick={() => setShowAddTask(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Task</h3>
            <div className="form-group">
              <label>Stage</label>
              <select
                value={selectedStageForTask ?? ''}
                onChange={(e) => setSelectedStageForTask(parseInt(e.target.value))}
                className="form-input"
              >
                <option value="">Select stage...</option>
                {raciData.raci_matrix.stages.map((stage, idx) => (
                  <option key={idx} value={idx}>
                    {stage.stage}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Task Name</label>
              <input
                type="text"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="Task name (e.g., Code Review)"
                className="form-input"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && selectedStageForTask !== null) {
                    handleAddTask()
                  } else if (e.key === 'Escape') {
                    setShowAddTask(false)
                  }
                }}
              />
            </div>
            <div className="modal-actions">
              <button 
                className="btn btn-primary" 
                onClick={handleAddTask}
                disabled={!selectedStageForTask || !newTaskName.trim()}
              >
                Add
              </button>
              <button className="btn btn-secondary" onClick={() => {
                setShowAddTask(false)
                setNewTaskName('')
                setSelectedStageForTask(null)
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="raci-matrix-container">
        <table className="raci-table">
          <thead>
            <tr>
              <th className="stage-col">Stage</th>
              <th className="task-col">Task</th>
              {allRoles.map(role => {
                const assignedMember = getAssignedMemberForRole(role)
                const availableMembers = getMembersForRole(role)
                const allMembers = getAllTeamMembers()
                const teamRoles = getTeamRoles()
                const isTeamRole = teamRoles.includes(role)
                
                return (
                  <th key={role} className={`role-col ${isTeamRole ? 'role-from-team' : 'role-custom'}`}>
                    <div className="role-header-content">
                      <span className="role-name">
                        {role}
                        {!isTeamRole && editing && (
                          <span className="role-badge-custom" title="Custom role (not in team)">*</span>
                        )}
                      </span>
                      {editing && (
                        <button
                          className="btn-remove-role"
                          onClick={() => handleRemoveRole(role)}
                          title={`Remove role "${role}" from all tasks`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {editing ? (
                      <div className="role-assignment">
                        {isTeamRole ? (
                          <select
                            className="role-member-select"
                            value={assignedMember?.user.id || ''}
                            onChange={(e) => handleAssignRoleMember(role, e.target.value || null)}
                          >
                            <option value="">-- Assign member --</option>
                            {availableMembers.length > 0 ? (
                              availableMembers.map(member => (
                                <option key={member.user.id} value={member.user.id}>
                                  {member.user.name} ({member.role_code}) - {member.user.email}
                                </option>
                              ))
                            ) : (
                              allMembers.map(member => (
                                <option key={member.user.id} value={member.user.id}>
                                  {member.user.name} ({member.role_code}) - {member.user.email}
                                </option>
                              ))
                            )}
                          </select>
                        ) : (
                          <div className="role-no-team-warning">
                            Add this role to team first
                          </div>
                        )}
                      </div>
                    ) : (
                      assignedMember && (
                        <div className="role-assigned">
                          <div className="assigned-member-name">{assignedMember.user.name}</div>
                          <div className="assigned-member-role">{assignedMember.role_code}</div>
                          <div className="assigned-member-email">{assignedMember.user.email}</div>
                        </div>
                      )
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {raciData.raci_matrix.stages.map((stage, stageIndex) =>
              stage.tasks.map((task, taskIndex) => (
                <tr key={`${stageIndex}-${taskIndex}`}>
                  {taskIndex === 0 && (
                    <td rowSpan={stage.tasks.length} className="stage-cell">
                      <div className="stage-cell-content">
                        <span>{stage.stage}</span>
                        {editing && (
                          <button
                            className="btn-remove-item"
                            onClick={() => handleRemoveStage(stageIndex)}
                            title={`Remove stage "${stage.stage}" and all its tasks`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="task-cell">
                    <div className="task-cell-content">
                      <span>{task.task}</span>
                      {editing && (
                        <button
                          className="btn-remove-item"
                          onClick={() => handleRemoveTask(stageIndex, taskIndex)}
                          title={`Remove task "${task.task}"`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                  {allRoles.map(role => {
                    const value = task.roles[role] || ''
                    return (
                      <td key={role} className="raci-cell">
                        {editing ? (
                          <select
                            value={value}
                            onChange={(e) => handleCellChange(stageIndex, taskIndex, role, e.target.value)}
                            className="raci-select"
                          >
                            <option value="">-</option>
                            <option value="R">R</option>
                            <option value="A">A</option>
                            <option value="I">I</option>
                          </select>
                        ) : (
                          <span className={`raci-value ${value ? `raci-${value.toLowerCase()}` : ''}`}>
                            {value || '-'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="raci-legend">
        <h3>Legend</h3>
        <div className="legend-items">
          <span><strong>R</strong> - Responsible</span>
          <span><strong>A</strong> - Accountable</span>
          <span><strong>I</strong> - Informed</span>
        </div>
      </div>
    </div>
  )
}

export default RACITab
