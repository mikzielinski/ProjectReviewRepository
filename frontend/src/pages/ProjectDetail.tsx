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
}

type Tab = 'overview' | 'documents' | 'team' | 'tasks' | 'gantt' | 'raci' | 'templates'

const ProjectDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    if (id) {
      loadProject()
    }
  }, [id])

  const loadProject = () => {
    api
      .get(`/projects/${id}`)
      .then((res) => setProject(res.data))
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
                <h3>Project Information</h3>
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
                <div className="info-row">
                  <span className="info-label">Created:</span>
                  <span>{new Date(project.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documents' && <DocumentsTab projectId={id!} />}
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
