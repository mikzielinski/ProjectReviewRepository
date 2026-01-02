import { useEffect, useState } from 'react'
import api from '../services/api'
import './Tabs.css'

interface Template {
  id: string
  doc_type: string
  name: string
  version: string
  status: string
  created_at: string
}

interface TemplatesTabProps {
  projectId: string
}

const TemplatesTab = ({ projectId: _projectId }: TemplatesTabProps) => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = () => {
    api
      .get('/templates')
      .then((res) => setTemplates(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  if (loading) {
    return <div className="loading">Loading templates...</div>
  }

  return (
    <div className="tab-panel">
      <h2>Available Templates</h2>
      {templates.length === 0 ? (
        <div className="empty-state">
          No templates available. Go to Templates Manager to create templates.
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>{template.name}</td>
                  <td>
                    <span className="badge">{template.doc_type}</span>
                  </td>
                  <td>{template.version}</td>
                  <td>
                    <span
                      className={`badge ${
                        template.status === 'APPROVED' ? 'badge-success' : 'badge-warning'
                      }`}
                    >
                      {template.status}
                    </span>
                  </td>
                  <td>{new Date(template.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default TemplatesTab

