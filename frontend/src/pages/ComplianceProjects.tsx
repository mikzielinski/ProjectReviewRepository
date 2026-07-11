import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../services/api'
import './ComplianceProjects.css'

interface Project {
  id: string
  key: string
  name: string
  description?: string
  project_type: string
  project_category?: string
  compliance_settings_json?: Record<string, boolean>
  status: string
}

export default function ComplianceProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/projects/my-projects', { params: { category: 'COMPLIANCE' } })
      .then((res) => setProjects(res.data || []))
      .finally(() => setLoading(false))
  }, [])

  const standards = (p: Project) => {
    const s = p.compliance_settings_json || {}
    return Object.entries(s).filter(([, v]) => v).map(([k]) => k.toUpperCase())
  }

  return (
    <Layout>
      <div className="compliance-projects-page">
        <header>
          <h1>Projekty Compliance & Security</h1>
          <p>ISO, SOC 2, SOX, HIPAA, GxP, AI Act, KNF/DORA — kontrolki, audyt, harmonogram testów</p>
        </header>

        {loading ? (
          <p>Ładowanie…</p>
        ) : projects.length === 0 ? (
          <div className="empty card">
            <p>Brak projektów compliance. Utwórz projekt z kategorii COMPLIANCE lub użyj typu ISMS / SOC2 / SOX w panelu admina.</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <article key={p.id} className="card compliance-card" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="card-top">
                  <code>{p.key}</code>
                  <span className="status">{p.status}</span>
                </div>
                <h3>{p.name}</h3>
                {p.description && <p className="desc">{p.description}</p>}
                <div className="standards">
                  {standards(p).map((st) => (
                    <span key={st} className="std-tag">{st}</span>
                  ))}
                </div>
                <p className="open-hint">Kontrolki · Audit trail · Harmonogram →</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
