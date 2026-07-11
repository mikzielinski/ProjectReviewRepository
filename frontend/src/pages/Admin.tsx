import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import api from '../services/api'
import './Admin.css'

interface ProjectType {
  id: string
  code: string
  name: string
  description?: string
  category: string
  default_compliance_settings_json?: Record<string, boolean>
  default_required_document_types_json?: Array<{ document_type_code: string }>
  default_control_framework_codes_json?: string[]
  is_active: boolean
}

interface Framework {
  id: string
  code: string
  name: string
  version?: string
  description?: string
  control_count: number
}

interface Control {
  id: string
  framework_code?: string
  control_ref: string
  title: string
  domain?: string
  control_type?: string
  testing_frequency_days?: number
  sub_controls?: Control[]
}

export default function Admin() {
  const [tab, setTab] = useState<'types' | 'controls'>('types')
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [controls, setControls] = useState<Control[]>([])
  const [frameworkFilter, setFrameworkFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [typesRes, fwRes] = await Promise.all([
        api.get('/admin/project-types'),
        api.get('/admin/frameworks'),
      ])
      setProjectTypes(typesRes.data || [])
      setFrameworks(fwRes.data || [])
    } catch {
      setError('Nie udało się załadować danych administracyjnych.')
    } finally {
      setLoading(false)
    }
  }

  const loadControls = async (code?: string) => {
    const params = code ? { framework_code: code } : {}
    const res = await api.get('/admin/controls', { params })
    setControls(res.data || [])
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (tab === 'controls') loadControls(frameworkFilter || undefined)
  }, [tab, frameworkFilter])

  return (
    <Layout>
      <div className="admin-page">
        <header className="admin-header">
          <div>
            <h1>Panel administracyjny</h1>
            <p>Typy projektów (dev vs compliance) i biblioteka kontrolek regulacyjnych</p>
          </div>
        </header>

        <div className="admin-tabs">
          <button className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>
            Typy projektów
          </button>
          <button className={tab === 'controls' ? 'active' : ''} onClick={() => setTab('controls')}>
            Biblioteka kontrolek
          </button>
        </div>

        {loading ? (
          <p>Ładowanie…</p>
        ) : error ? (
          <p className="admin-error">{error}</p>
        ) : tab === 'types' ? (
          <section className="card admin-section">
            <h2>Typy projektów</h2>
            <p className="hint">
              Projekty developerskie (SDLC) vs compliance/security — każdy typ definiuje wymagane dokumenty, szablony i frameworki kontrolek.
            </p>
            {projectTypes.length === 0 ? (
              <p className="hint">Brak zdefiniowanych typów projektów.</p>
            ) : (
            <div className="type-grid">
              {projectTypes.map((t) => (
                <article key={t.id} className={`type-card ${t.category.toLowerCase()}`}>
                  <div className="type-card-head">
                    <span className={`badge ${t.category === 'COMPLIANCE' ? 'compliance' : 'dev'}`}>
                      {t.category === 'COMPLIANCE' ? 'Compliance' : 'Development'}
                    </span>
                    <code>{t.code}</code>
                  </div>
                  <h3>{t.name}</h3>
                  {t.description && <p>{t.description}</p>}
                  {t.default_control_framework_codes_json?.length ? (
                    <div className="tags">
                      {t.default_control_framework_codes_json.map((fw) => (
                        <span key={fw} className="tag">{fw}</span>
                      ))}
                    </div>
                  ) : null}
                  {t.default_required_document_types_json?.length ? (
                    <p className="meta">
                      Dokumenty: {t.default_required_document_types_json.map((d) => d.document_type_code).join(', ')}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
            )}
          </section>
        ) : (
          <section className="card admin-section">
            <div className="controls-toolbar">
              <h2>Biblioteka kontrolek</h2>
              <select value={frameworkFilter} onChange={(e) => setFrameworkFilter(e.target.value)}>
                <option value="">Wszystkie frameworki</option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.code}>{fw.code} — {fw.name} ({fw.control_count})</option>
                ))}
              </select>
            </div>
            <div className="framework-summary">
              {frameworks.map((fw) => (
                <div key={fw.id} className="fw-chip" onClick={() => setFrameworkFilter(fw.code)}>
                  <strong>{fw.code}</strong>
                  <span>{fw.control_count} kontrolek</span>
                </div>
              ))}
            </div>
            <table className="controls-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Tytuł</th>
                  <th>Framework</th>
                  <th>Domena</th>
                  <th>Typ</th>
                  <th>Częstotliwość testu</th>
                </tr>
              </thead>
              <tbody>
                {controls.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-cell">Brak kontrolek dla wybranego filtra.</td>
                  </tr>
                ) : controls.flatMap((c) => {
                  const rows: JSX.Element[] = []
                  const walk = (ctrl: Control, depth: number) => {
                    rows.push(
                      <tr key={ctrl.id}>
                        <td style={{ paddingLeft: `${depth * 1.25}rem` }}><code>{ctrl.control_ref}</code></td>
                        <td>{ctrl.title}</td>
                        <td>{ctrl.framework_code}</td>
                        <td>{ctrl.domain || '—'}</td>
                        <td>{ctrl.control_type || '—'}</td>
                        <td>{ctrl.testing_frequency_days ? `${ctrl.testing_frequency_days}d` : '—'}</td>
                      </tr>
                    )
                    ;(ctrl.sub_controls || []).forEach((sub) => walk(sub, depth + 1))
                  }
                  walk(c, 0)
                  return rows
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Layout>
  )
}
