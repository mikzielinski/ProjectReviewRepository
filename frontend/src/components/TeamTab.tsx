import { useEffect, useState } from 'react'
import api from '../services/api'
import './Tabs.css'

interface User {
  id: string
  email: string
  name: string
}

interface ProjectMember {
  id: string
  user_id: string
  role_code: string
  is_temporary: boolean
  expires_at: string | null
  user: User | null
}

interface TeamTabProps {
  projectId: string
  onUpdate?: () => void
}

const TeamTab = ({ projectId, onUpdate }: TeamTabProps) => {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null)
  const [formData, setFormData] = useState({ user_id: '', role_code: 'Architect', is_temporary: false, expires_at: '' })
  const [inviting, setInviting] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadData()
  }, [projectId])

  const loadData = () => {
    Promise.all([
      api.get(`/projects/${projectId}/members`),
      api.get('/users'),
      api.get(`/projects/${projectId}/raci`).catch(() => null), // RACI might not be available
    ])
      .then(([membersRes, usersRes, raciRes]) => {
        setMembers(membersRes.data)
        setUsers(usersRes.data)
        
        // Get roles from RACI matrix
        const rolesFromRACI = new Set<string>()
        if (raciRes?.data?.raci_matrix?.stages) {
          raciRes.data.raci_matrix.stages.forEach((stage: any) => {
            stage.tasks?.forEach((task: any) => {
              Object.keys(task.roles || {}).forEach(role => {
                // Filter out roles with asterisk or invalid characters
                if (role && !role.includes('*') && role.trim().length > 0) {
                  rolesFromRACI.add(role.trim())
                }
              })
            })
          })
        }
        
        // Get roles from existing team members
        const rolesFromTeam = new Set<string>()
        membersRes.data.forEach((member: ProjectMember) => {
          if (member.role_code && !member.role_code.includes('*')) {
            rolesFromTeam.add(member.role_code.trim())
          }
        })
        
        // Combine: RACI roles + Team roles + default roles
        // Filter out roles with asterisk or invalid names
        const defaultRoles = ['Architect', 'QA Officer', 'Business Owner', 'Release Manager', 'SME', 'Auditor']
        const allRoles = new Set<string>()
        
        // Add default roles
        defaultRoles.forEach(role => allRoles.add(role))
        
        // Add RACI roles (filtered)
        rolesFromRACI.forEach(role => {
          if (role && !role.includes('*') && role.trim().length > 0) {
            allRoles.add(role.trim())
          }
        })
        
        // Add team roles (filtered)
        rolesFromTeam.forEach(role => {
          if (role && !role.includes('*') && role.trim().length > 0) {
            allRoles.add(role.trim())
          }
        })
        
        // Sort and filter out empty or invalid roles
        const sortedRoles = Array.from(allRoles)
          .filter(role => role && role.trim().length > 0 && !role.includes('*'))
          .sort()
        
        setAvailableRoles(sortedRoles)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    try {
      const payload: any = {
        user_id: formData.user_id,
        role_code: formData.role_code,
        is_temporary: formData.is_temporary,
      }
      if (formData.is_temporary && formData.expires_at) {
        payload.expires_at = new Date(formData.expires_at).toISOString()
      }
      await api.post(`/projects/${projectId}/members`, payload)
      setShowInviteForm(false)
      setFormData({ user_id: '', role_code: 'Architect', is_temporary: false, expires_at: '' })
      loadData()
      onUpdate?.()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to invite member')
    } finally {
      setInviting(false)
    }
  }

  const handleEdit = (member: ProjectMember) => {
    setEditingMember(member)
    setFormData({
      user_id: member.user_id,
      role_code: member.role_code,
      is_temporary: member.is_temporary,
      expires_at: member.expires_at ? new Date(member.expires_at).toISOString().split('T')[0] : '',
    })
    setShowInviteForm(false)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMember) return
    
    setUpdating(true)
    try {
      const payload: any = {
        user_id: formData.user_id,
        role_code: formData.role_code,
        is_temporary: formData.is_temporary,
      }
      if (formData.is_temporary && formData.expires_at) {
        payload.expires_at = new Date(formData.expires_at).toISOString()
      }
      await api.put(`/projects/${projectId}/members/${editingMember.id}`, payload)
      setEditingMember(null)
      setFormData({ user_id: '', role_code: 'Architect', is_temporary: false, expires_at: '' })
      loadData()
      onUpdate?.()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update member')
    } finally {
      setUpdating(false)
    }
  }

  const handleDisable = async (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to remove this member?')) return
    try {
      await api.post(`/projects/${projectId}/members/${memberId}/disable`)
      loadData()
      onUpdate?.()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove member')
    }
  }

  const cancelEdit = () => {
    setEditingMember(null)
    setFormData({ user_id: '', role_code: 'Architect', is_temporary: false, expires_at: '' })
  }

  if (loading) {
    return <div className="loading">Loading team members...</div>
  }

  return (
    <div className="tab-panel">
      <div className="panel-header">
        <h2>Team Members</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowInviteForm(!showInviteForm)
            setEditingMember(null)
          }}
        >
          + Invite Member
        </button>
      </div>

      {(showInviteForm || editingMember) && (
        <div className="create-form">
          <h3>{editingMember ? 'Edit Team Member' : 'Invite Team Member'}</h3>
          <form onSubmit={editingMember ? handleUpdate : handleInvite}>
            {!editingMember && (
              <div className="form-group">
                <label>User</label>
                <select
                  value={formData.user_id}
                  onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                  required
                >
                  <option value="">Select user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Role</label>
              <select
                value={formData.role_code}
                onChange={(e) => setFormData({ ...formData, role_code: e.target.value })}
                required
              >
                {availableRoles.length > 0 ? (
                  availableRoles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))
                ) : (
                  <>
                    <option value="Architect">Architect</option>
                    <option value="QA Officer">QA Officer</option>
                    <option value="Business Owner">Business Owner</option>
                    <option value="Release Manager">Release Manager</option>
                    <option value="SME">SME</option>
                    <option value="Auditor">Auditor</option>
                  </>
                )}
              </select>
              {availableRoles.length === 0 && (
                <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  Loading roles from RACI...
                </p>
              )}
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.is_temporary}
                  onChange={(e) => setFormData({ ...formData, is_temporary: e.target.checked })}
                />
                Temporary member
              </label>
            </div>
            {formData.is_temporary && (
              <div className="form-group">
                <label>Expires At</label>
                <input
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  required={formData.is_temporary}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}
            <div className="form-actions">
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={inviting || updating}
              >
                {editingMember 
                  ? (updating ? 'Updating...' : 'Update')
                  : (inviting ? 'Inviting...' : 'Invite')
                }
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowInviteForm(false)
                  cancelEdit()
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {members.length === 0 ? (
        <div className="empty-state">No team members yet. Invite your first member!</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.user?.name || 'Unknown'}</td>
                  <td>{member.user?.email || 'N/A'}</td>
                  <td>
                    <span className="badge">{member.role_code}</span>
                  </td>
                  <td>
                    {member.is_temporary ? (
                      <span className="badge badge-warning">Temporary</span>
                    ) : (
                      <span className="badge badge-success">Permanent</span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleEdit(member)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={(e) => handleDisable(member.id, e)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default TeamTab
