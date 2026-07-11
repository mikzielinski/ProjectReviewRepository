import { useEffect, useState } from 'react'
import api from '../services/api'
import './ComplianceControlsTab.css'

interface UserOption {
  id: string
  name: string
  email: string
}

interface Assignment {
  id: string
  control_ref?: string
  control_title?: string
  framework_code?: string
  domain?: string
  control_owner_user_id?: string
  control_owner_name?: string
  assignee_user_id?: string
  assignee_name?: string
  status: string
  is_applicable: boolean
  implementation_notes?: string
  review_frequency_days?: number
  next_review_at?: string
  last_tested_at?: string
}

interface ScheduleItem {
  assignment_id: string
  control_ref: string
  control_title: string
  framework_code?: string
  control_owner_name?: string
  assignee_name?: string
  next_review_at?: string
  status: string
  is_overdue?: boolean
}

interface AuditEntry {
  id: string
  action: string
  entity_type: string
  actor_name?: string
  created_at?: string
  after_json?: Record<string, unknown>
}

interface Props {
  projectId: string
}

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTED', 'NON_APPLICABLE']

export default function ComplianceControlsTab({ projectId }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [subTab, setSubTab] = useState<'controls' | 'schedule' | 'audit'>('controls')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [ctrlRes, schedRes, auditRes, usersRes] = await Promise.all([
        api.get(`/projects/${projectId}/controls`).catch(() => ({ data: [] })),
        api.get(`/projects/${projectId}/controls/schedule`).catch(() => ({ data: [] })),
        api.get(`/projects/${projectId}/audit-trail`).catch(() => ({ data: [] })),
        api.get('/users').catch(() => ({ data: [] })),
      ])
      setAssignments(ctrlRes.data || [])
      setSchedule(schedRes.data || [])
      setAudit(auditRes.data || [])
      setUsers(usersRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  const syncControls = async () => {
    setSyncing(true)
    try {
      const res = await api.post(`/projects/${projectId}/controls/sync`)
      setAssignments(res.data || [])
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const updateAssignment = async (id: string, patch: Partial<Assignment>) => {
    await api.put(`/projects/${projectId}/controls/${id}`, patch)
    await load()
  }

  if (loading) return <p>Ładowanie kontrolek…</p>

  return (
    <div className="compliance-controls-tab">
      <div className="cc-toolbar">
        <div className="cc-subtabs">
          <button className={subTab === 'controls' ? 'active' : ''} onClick={() => setSubTab('controls')}>Kontrolki</button>
          <button className={subTab === 'schedule' ? 'active' : ''} onClick={() => setSubTab('schedule')}>Harmonogram</button>
          <button className={subTab === 'audit' ? 'active' : ''} onClick={() => setSubTab('audit')}>Audit trail</button>
        </div>
        <button className="btn-primary" onClick={syncControls} disabled={syncing}>
          {syncing ? 'Synchronizacja…' : '↻ Sync kontrolek z frameworków'}
        </button>
      </div>

      {subTab === 'controls' && (
        assignments.length === 0 ? (
          <div className="cc-empty card">
            <p>Brak przypisanych kontrolek. Kliknij „Sync kontrolek” aby załadować kontrolki z włączonych standardów (ISO, SOC2, SOX…).</p>
          </div>
        ) : (
          <table className="cc-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Kontrolka</th>
                <th>Framework</th>
                <th>Control Owner</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Nast. review</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td><code>{a.control_ref}</code></td>
                  <td>
                    <strong>{a.control_title}</strong>
                    {a.domain && <div className="muted">{a.domain}</div>}
                  </td>
                  <td>{a.framework_code}</td>
                  <td>
                    <select
                      value={a.control_owner_user_id || ''}
                      onChange={(e) => updateAssignment(a.id, { control_owner_user_id: e.target.value || undefined })}
                    >
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={a.assignee_user_id || ''}
                      onChange={(e) => updateAssignment(a.id, { assignee_user_id: e.target.value || undefined })}
                    >
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={a.status}
                      onChange={(e) => updateAssignment(a.id, { status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>{a.next_review_at ? new Date(a.next_review_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {subTab === 'schedule' && (
        <table className="cc-table">
          <thead>
            <tr>
              <th>Kontrolka</th>
              <th>Framework</th>
              <th>Owner</th>
              <th>Assignee</th>
              <th>Termin review</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((s) => (
              <tr key={s.assignment_id} className={s.is_overdue ? 'overdue' : ''}>
                <td><code>{s.control_ref}</code> {s.control_title}</td>
                <td>{s.framework_code}</td>
                <td>{s.control_owner_name || '—'}</td>
                <td>{s.assignee_name || '—'}</td>
                <td>{s.next_review_at ? new Date(s.next_review_at).toLocaleDateString() : '—'}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {subTab === 'audit' && (
        <div className="audit-list">
          {audit.length === 0 ? (
            <p className="muted">Brak wpisów audit trail dla tego projektu.</p>
          ) : (
            audit.map((entry) => (
              <div key={entry.id} className="audit-row">
                <div className="audit-meta">
                  <strong>{entry.action}</strong>
                  <span>{entry.entity_type}</span>
                  <span>{entry.actor_name}</span>
                  <time>{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</time>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
