import { useEffect, useState } from 'react'
import api from '../services/api'
import './AuditLogModal.css'

interface Props {
  templateId: string
  templateName: string
  isOpen: boolean
  onClose: () => void
}

interface AuditLogEntry {
  id: string
  action: string
  actor_user_id: string
  actor_name: string | null
  actor_email: string | null
  created_at: string | null
  before_json: any
  after_json: any
  ip: string | null
  user_agent: string | null
}

interface AuditLogResponse {
  template_id: string
  template_name: string
  total_entries: number
  entries: AuditLogEntry[]
}

export default function AuditLogModal({
  templateId,
  templateName,
  isOpen,
  onClose
}: Props) {
  const [auditLog, setAuditLog] = useState<AuditLogResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const fetchAuditLog = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await api.get<AuditLogResponse>(`/templates/${templateId}/audit-log`)
        setAuditLog(response.data)
      } catch (err: any) {
        console.error('Error loading audit log:', err)
        setError(err.response?.data?.detail || 'Failed to load audit log')
      } finally {
        setLoading(false)
      }
    }

    fetchAuditLog()
  }, [isOpen, templateId])

  if (!isOpen) return null

  const formatAction = (action: string): string => {
    return action.replace(/_/g, ' ').toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // const formatChanges = (json: any): Array<{key: string, before: string, after: string}> => {
  //   if (!json || typeof json !== 'object') return []
  //   return Object.entries(json).map(([key, value]) => ({
  //     key: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
  //     before: String(value || 'N/A'),
  //     after: ''
  //   }))
  // }

  const getChangeDisplay = (beforeJson: any, afterJson: any, entry: AuditLogEntry): Array<{key: string, before: string, after: string}> => {
    const allKeys = new Set<string>()
    if (beforeJson && typeof beforeJson === 'object') {
      Object.keys(beforeJson).forEach(k => allKeys.add(k))
    }
    if (afterJson && typeof afterJson === 'object') {
      Object.keys(afterJson).forEach(k => allKeys.add(k))
    }

    const changes: Array<{key: string, before: string, after: string}> = []
    
    // Track if we've added created_by fields to avoid duplicates
    let createdByAdded = false
    
    Array.from(allKeys).forEach(key => {
      // Special handling for created_by - split into ID and username
      if (key === 'created_by' && !createdByAdded) {
        const beforeId = beforeJson && beforeJson[key] ? String(beforeJson[key]) : null
        const afterId = afterJson && afterJson[key] ? String(afterJson[key]) : null
        
        // Only add if we have at least one value
        if (beforeId || afterId) {
          changes.push({
            key: 'Created By User ID',
            before: beforeId || 'N/A',
            after: afterId || 'N/A'
          })
          
          // Use resolved username from JSON if available, otherwise try to use actor info or look up from entry
          let beforeName = beforeJson && beforeJson['created_by_name'] 
            ? beforeJson['created_by_name'] 
            : 'N/A'
          let afterName = afterJson && afterJson['created_by_name'] 
            ? afterJson['created_by_name'] 
            : 'N/A'
          
          // If no resolved name but we have ID matching actor, use actor info
          if (beforeName === 'N/A' && beforeId) {
            beforeName = (beforeId === entry.actor_user_id) 
              ? (entry.actor_name || entry.actor_email || beforeId)
              : beforeId
          }
          if (afterName === 'N/A' && afterId) {
            afterName = (afterId === entry.actor_user_id)
              ? (entry.actor_name || entry.actor_email || afterId)
              : afterId
          }
          
          // For CREATE action, the actor is usually the creator
          if (entry.action === 'TEMPLATE_CREATE' && afterName === 'N/A' && afterId) {
            afterName = entry.actor_name || entry.actor_email || afterId
          }
          
          changes.push({
            key: 'Created By',
            before: beforeName,
            after: afterName
          })
          
          createdByAdded = true
        }
      } else if (key === 'created_by_user_id' || key === 'created_by_name') {
        // Skip these as they're handled with created_by
        return
      } else if (key !== 'created_by' || !createdByAdded) {
        changes.push({
          key: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          before: beforeJson && beforeJson[key] !== undefined ? String(beforeJson[key]) : 'N/A',
          after: afterJson && afterJson[key] !== undefined ? String(afterJson[key]) : 'N/A'
        })
      }
    })

    return changes
  }

  const exportToCSV = () => {
    if (!auditLog) return

    const headers = ['Action', 'Date/Time', 'Actor', 'Field', 'Before', 'After', 'IP Address', 'User Agent']
    const rows: string[][] = []

    auditLog.entries.forEach(entry => {
      const changes = getChangeDisplay(entry.before_json, entry.after_json, entry)
      
      if (changes.length > 0) {
        changes.forEach(change => {
          rows.push([
            formatAction(entry.action),
            entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A',
            entry.actor_name || entry.actor_email || 'Unknown',
            change.key,
            change.before,
            change.after,
            entry.ip || 'N/A',
            entry.user_agent || 'N/A'
          ])
        })
      } else {
        // No changes, but still log the action
        rows.push([
          formatAction(entry.action),
          entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A',
          entry.actor_name || entry.actor_email || 'Unknown',
          'N/A',
          'N/A',
          'N/A',
          entry.ip || 'N/A',
          entry.user_agent || 'N/A'
        ])
      }
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `audit-log-${templateName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportToExcel = async () => {
    if (!auditLog) return

    try {
      // Dynamically import xlsx library
      const XLSX = await import('xlsx')

      const headers = ['Action', 'Date/Time', 'Actor', 'Field', 'Before', 'After', 'IP Address', 'User Agent']
      const rows: any[][] = []

      auditLog.entries.forEach(entry => {
        const changes = getChangeDisplay(entry.before_json, entry.after_json, entry)
        
        if (changes.length > 0) {
          changes.forEach(change => {
            rows.push([
              formatAction(entry.action),
              entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A',
              entry.actor_name || entry.actor_email || 'Unknown',
              change.key,
              change.before,
              change.after,
              entry.ip || 'N/A',
              entry.user_agent || 'N/A'
            ])
          })
        } else {
          // No changes, but still log the action
          rows.push([
            formatAction(entry.action),
            entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A',
            entry.actor_name || entry.actor_email || 'Unknown',
            'N/A',
            'N/A',
            'N/A',
            entry.ip || 'N/A',
            entry.user_agent || 'N/A'
          ])
        }
      })

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

      // Set column widths
      const colWidths = [
        { wch: 20 }, // Action
        { wch: 20 }, // Date/Time
        { wch: 25 }, // Actor
        { wch: 25 }, // Field
        { wch: 30 }, // Before
        { wch: 30 }, // After
        { wch: 15 }, // IP Address
        { wch: 50 }  // User Agent
      ]
      ws['!cols'] = colWidths

      XLSX.utils.book_append_sheet(wb, ws, 'Audit Log')

      // Generate Excel file and download
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `audit-log-${templateName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      // Fallback to CSV if xlsx library is not available
      alert('Excel export failed. Falling back to CSV export.')
      exportToCSV()
    }
  }

  return (
    <div className="audit-overlay" onClick={onClose}>
      <div className="audit-modal" onClick={(e) => e.stopPropagation()}>
        <header className="audit-header">
          <h3>Audit Log: {templateName}</h3>
          <div className="audit-header-actions">
            <button 
              className="audit-export-btn audit-export-csv" 
              onClick={exportToCSV}
              title="Export to CSV"
            >
              📥 CSV
            </button>
            <button 
              className="audit-export-btn audit-export-excel" 
              onClick={exportToExcel}
              title="Export to Excel"
            >
              📊 Excel
            </button>
            <button className="audit-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        {loading && (
          <div className="audit-loading">
            <div>Loading audit log…</div>
          </div>
        )}

        {error && (
          <div className="audit-error">
            <div>Error: {error}</div>
          </div>
        )}

        {!loading && !error && auditLog && (
          <div className="audit-content">
            <div className="audit-summary">
              <span>Total entries: <strong>{auditLog.total_entries}</strong></span>
            </div>

            {auditLog.entries.length === 0 ? (
              <div className="audit-empty">
                No audit log entries found for this template.
              </div>
            ) : (
              <div className="audit-list">
                {auditLog.entries.map((entry) => (
                  <div key={entry.id} className="audit-entry">
                    <div className="audit-entry-header">
                      <div className="audit-entry-action">
                        <span className="audit-action-badge">{formatAction(entry.action)}</span>
                        <span className="audit-entry-time">
                          {entry.created_at 
                            ? new Date(entry.created_at).toLocaleString()
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="audit-entry-actor">
                        {entry.actor_name || entry.actor_email || 'Unknown User'}
                      </div>
                    </div>

                    {(entry.before_json || entry.after_json) && (() => {
                      const changes = getChangeDisplay(entry.before_json, entry.after_json, entry)
                      if (changes.length === 0) return null
                      
                      return (
                        <div className="audit-entry-changes">
                          <div className="audit-changes-table-wrapper">
                            <table className="audit-changes-table">
                            <thead>
                              <tr>
                                <th>Field</th>
                                <th>Before</th>
                                <th>After</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changes.map((change, idx) => (
                                <tr key={idx} className={change.before !== change.after ? 'audit-change-row' : ''}>
                                  <td className="audit-change-key">{change.key}</td>
                                  <td className="audit-change-before">{change.before}</td>
                                  <td className="audit-change-after">{change.after}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      )
                    })()}

                    {(entry.ip || entry.user_agent) && (
                      <div className="audit-entry-meta">
                        {entry.ip && <span className="audit-meta-item">IP: {entry.ip}</span>}
                        {entry.user_agent && (
                          <span className="audit-meta-item">User Agent: {entry.user_agent}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

