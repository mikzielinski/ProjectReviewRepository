import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../services/api'
import './ProjectDetail.css'
import DocumentsTab from '../components/DocumentsTab'
import TeamTab from '../components/TeamTab'
import RACITab from '../components/RACITab'
import TemplatesTab from '../components/TemplatesTab'
import TasksTab from '../components/TasksTab'
import GanttTab from '../components/GanttTab'

interface Project {
  id: string
  key: string
  name: string
  status: string
  created_at: string
  folder_id?: string
  enable_4_eyes_principal?: boolean
  required_document_types_json?: any[]
  retention_policy_json?: any
  approval_policies_json?: any
  escalation_chain_json?: any
  raci_matrix_json?: any
}

type Tab = 'overview' | 'documents' | 'team' | 'tasks' | 'gantt' | 'raci' | 'templates'

const ProjectDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [folderName, setFolderName] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      loadProject()
    }
  }, [id])

  const loadProject = () => {
    api
      .get(`/projects/${id}`)
      .then((res) => {
        setProject(res.data)
        // Load folder name if folder_id exists
        if (res.data.folder_id) {
          api.get('/folders')
            .then((foldersRes) => {
              const findFolderName = (folders: any[], folderId: string): string | null => {
                for (const folder of folders) {
                  if (folder.id === folderId) {
                    return folder.name
                  }
                  if (folder.subfolders && folder.subfolders.length > 0) {
                    const found = findFolderName(folder.subfolders, folderId)
                    if (found) return found
                  }
                }
                return null
              }
              const name = findFolderName(foldersRes.data || [], res.data.folder_id)
              setFolderName(name)
            })
            .catch(() => setFolderName(null))
        }
      })
      .catch((err) => {
        console.error(err)
        navigate('/projects')
      })
      .finally(() => setLoading(false))
  }

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading project...</div>
      </Layout>
    )
  }

  if (!project) {
    return (
      <Layout>
        <div className="error">Project not found</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="project-detail">
        <div className="project-header">
          <div>
            <button className="back-btn" onClick={() => navigate('/projects')}>
              ← Back to Projects
            </button>
            <h1>{project.name}</h1>
            <p className="project-key">Key: {project.key}</p>
          </div>
          <span className={`status-badge status-${project.status.toLowerCase()}`}>
            {project.status}
          </span>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Documents
          </button>
          <button
            className={`tab ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            Team
          </button>
          <button
            className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks
          </button>
          <button
            className={`tab ${activeTab === 'gantt' ? 'active' : ''}`}
            onClick={() => setActiveTab('gantt')}
          >
            Gantt
          </button>
          <button
            className={`tab ${activeTab === 'raci' ? 'active' : ''}`}
            onClick={() => setActiveTab('raci')}
          >
            RACI Matrix
          </button>
          <button
            className={`tab ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            Templates
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'overview' && (
            <div className="overview-tab">
              <div className="info-card">
                <h3>ℹ️ Project Information</h3>
                <div className="info-row">
                  <span className="info-label">Name:</span>
                  <span>{project.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Key:</span>
                  <span>{project.key}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Status:</span>
                  <span className={`status-badge status-${project.status.toLowerCase()}`}>
                    {project.status}
                  </span>
                </div>
                {folderName && (
                  <div className="info-row">
                    <span className="info-label">Folder:</span>
                    <span>{folderName}</span>
                  </div>
                )}
                <div className="info-row">
                  <span className="info-label">Created:</span>
                  <span>{new Date(project.created_at).toLocaleString()}</span>
                </div>
                {project.enable_4_eyes_principal !== undefined && (
                  <div className="info-row">
                    <span className="info-label">4 Eyes Principal:</span>
                    <span className={`status-badge ${project.enable_4_eyes_principal ? 'status-active' : 'status-inactive'}`}>
                      {project.enable_4_eyes_principal ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                )}
              </div>

              {project.required_document_types_json && project.required_document_types_json.length > 0 && (
                <div className="info-card">
                  <h3>📄 Required Document Types</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {project.required_document_types_json.map((docType: any, index: number) => (
                      <div key={index} style={{ 
                        padding: '0.75rem', 
                        background: '#f8f9fa', 
                        borderRadius: '6px',
                        border: '1px solid #e9ecef'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: '#2c3e50' }}>
                          {docType.document_type_name || docType.document_type_code}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                          <span style={{ fontWeight: '500' }}>Update frequency:</span>{' '}
                          <span style={{ 
                            padding: '0.2rem 0.5rem',
                            background: '#e3f2fd',
                            borderRadius: '4px',
                            color: '#1976d2',
                            fontSize: '0.8rem'
                          }}>
                            {docType.update_frequency === 'NEVER' ? 'Never' :
                             docType.update_frequency === 'ONCE_YEAR' ? 'Once a Year' :
                             docType.update_frequency === 'QUARTERLY' ? 'Quarterly' :
                             docType.update_frequency === 'MONTHLY' ? 'Monthly' :
                             docType.update_frequency === 'WEEKLY' ? 'Weekly' :
                             docType.update_frequency || 'Not specified'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {project.retention_policy_json && project.retention_policy_json.enabled && (
                <div className="info-card">
                  <h3>🗄️ Retention Policy</h3>
                  <div className="info-row">
                    <span className="info-label">Status:</span>
                    <span className="status-badge status-active">Enabled</span>
                  </div>
                  {project.retention_policy_json.retention_period_days && (
                    <div className="info-row">
                      <span className="info-label">Retention Period:</span>
                      <span><strong>{project.retention_policy_json.retention_period_days}</strong> days</span>
                    </div>
                  )}
                  {project.retention_policy_json.archive_after_days && (
                    <div className="info-row">
                      <span className="info-label">Archive After:</span>
                      <span><strong>{project.retention_policy_json.archive_after_days}</strong> days</span>
                    </div>
                  )}
                  {project.retention_policy_json.delete_after_days && (
                    <div className="info-row">
                      <span className="info-label">Delete After:</span>
                      <span><strong>{project.retention_policy_json.delete_after_days}</strong> days</span>
                    </div>
                  )}
                </div>
              )}

              {project.approval_policies_json && project.approval_policies_json.document_type_approvals && project.approval_policies_json.document_type_approvals.length > 0 && (
                <div className="info-card">
                  <h3>✅ Approval Policies</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {project.approval_policies_json.document_type_approvals.map((rule: any, index: number) => (
                      <div key={index} style={{ 
                        padding: '1rem', 
                        background: '#f8f9fa', 
                        borderRadius: '6px', 
                        border: '1px solid #e9ecef'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#2c3e50', fontSize: '0.95rem' }}>
                          {rule.document_type_name || rule.document_type_code || 'Document Type'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                          {rule.reviewer_user_id && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: '#6c757d', minWidth: '80px' }}>Reviewer:</span>
                              <span style={{ 
                                padding: '0.2rem 0.5rem',
                                background: '#fff3cd',
                                borderRadius: '4px',
                                color: '#856404',
                                fontSize: '0.8rem'
                              }}>
                                {rule.reviewer_user_id}
                              </span>
                            </div>
                          )}
                          {rule.approver_user_id && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: '#6c757d', minWidth: '80px' }}>Approver:</span>
                              <span style={{ 
                                padding: '0.2rem 0.5rem',
                                background: '#d1ecf1',
                                borderRadius: '4px',
                                color: '#0c5460',
                                fontSize: '0.8rem'
                              }}>
                                {rule.approver_user_id}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {project.escalation_chain_json && project.escalation_chain_json.enabled && (
                <div className="info-card">
                  <h3>🔔 Escalation Chain</h3>
                  <div className="info-row">
                    <span className="info-label">Status:</span>
                    <span className="status-badge status-active">Enabled</span>
                  </div>
                  {project.escalation_chain_json.escalation_levels && project.escalation_chain_json.escalation_levels.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#34495e', fontSize: '0.9rem' }}>Escalation Levels:</div>
                      {project.escalation_chain_json.escalation_levels.map((level: any, index: number) => (
                        <div key={index} style={{ 
                          padding: '0.75rem', 
                          background: '#f8f9fa', 
                          borderRadius: '6px', 
                          marginBottom: '0.5rem', 
                          fontSize: '0.85rem',
                          border: '1px solid #e9ecef',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <span style={{ 
                            padding: '0.2rem 0.5rem',
                            background: '#e3f2fd',
                            borderRadius: '4px',
                            color: '#1976d2',
                            fontWeight: '600',
                            fontSize: '0.75rem'
                          }}>
                            Level {index + 1}
                          </span>
                          <span style={{ color: '#6c757d' }}>After</span>
                          <strong style={{ color: '#2c3e50' }}>{level.days_after || 'N/A'} days</strong>
                          <span style={{ color: '#6c757d' }}>→ Notify:</span>
                          <span style={{ 
                            padding: '0.2rem 0.5rem',
                            background: '#fff3cd',
                            borderRadius: '4px',
                            color: '#856404',
                            fontSize: '0.8rem'
                          }}>
                            {level.notify_role || 'N/A'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {project.raci_matrix_json && project.raci_matrix_json.stages && project.raci_matrix_json.stages.length > 0 && (
                <div className="info-card">
                  <h3>📊 RACI Matrix</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {project.raci_matrix_json.stages.map((stage: any, index: number) => (
                      <div key={index} style={{
                        padding: '0.75rem',
                        background: '#f8f9fa',
                        borderRadius: '6px',
                        border: '1px solid #e9ecef',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}>
                        <span style={{
                          padding: '0.3rem 0.6rem',
                          background: '#3498db',
                          color: 'white',
                          borderRadius: '4px',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                          minWidth: '50px',
                          textAlign: 'center'
                        }}>
                          {index + 1}
                        </span>
                        <span style={{ color: '#2c3e50', fontWeight: '500' }}>
                          {stage.name || 'Unnamed Stage'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'documents' && <DocumentsTab projectId={id!} projectName={project.name} />}
          {activeTab === 'team' && <TeamTab projectId={id!} onUpdate={loadProject} />}
          {activeTab === 'tasks' && <TasksTab projectId={id!} />}
          {activeTab === 'gantt' && <GanttTab projectId={id!} />}
          {activeTab === 'raci' && <RACITab projectId={id!} onTeamUpdate={loadProject} />}
          {activeTab === 'templates' && <TemplatesTab projectId={id!} />}
        </div>
      </div>
    </Layout>
  )
}

export default ProjectDetail
