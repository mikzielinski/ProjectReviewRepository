import { useEffect, useState } from 'react'
import api from '../services/api'
import AuditLogModal from './AuditLogModal'
import './TemplateInfoModal.css'

interface Props {
  documentId: string
  isOpen: boolean
  onClose: () => void
}

interface CreatorInfo {
  id: string
  name: string
  email: string
}

interface ApproverInfo {
  id: string
  name: string
  email: string
  approved_at: string | null
  comment: string | null
}

interface DocumentInfo {
  document_id: string
  title: string
  doc_type: string
  status: string
  current_version: string | null
  current_version_state: string | null
  created_by: CreatorInfo | null
  created_at: string | null
  approved_by: ApproverInfo | null
  template_name: string | null
  template_version: string | null
  file_hash: string | null
  pdf_hash: string | null
  checked_out_by: string | null
  checked_out_at: string | null
  version_count: number
}

export default function DocumentInfoModal({
  documentId,
  isOpen,
  onClose
}: Props) {
  const [info, setInfo] = useState<DocumentInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !documentId) return

    setLoading(true)
    setError(null)
    
    // Fetch document and version info
    Promise.all([
      api.get(`/documents/${documentId}`),
      api.get(`/documents/${documentId}/versions`)
    ])
      .then(([docResponse, versionsResponse]) => {
        const document = docResponse.data
        const versions = versionsResponse.data || []
        const currentVersion = document.current_version_id
          ? versions.find((v: any) => v.id === document.current_version_id)
          : versions[0]
        
        setCurrentVersionId(currentVersion?.id || null)
        
        // Build document info from available data
        // created_by might be UUID or object, handle both cases
        let createdByInfo: CreatorInfo | null = null
        if (document.created_by) {
          if (typeof document.created_by === 'string' || typeof document.created_by === 'object') {
            // If it's an object with id/name/email, use it
            if (typeof document.created_by === 'object' && document.created_by.id) {
              createdByInfo = {
                id: document.created_by.id,
                name: document.created_by.name || 'Unknown',
                email: document.created_by.email || ''
              }
            } else {
              // If it's just a UUID string, we'll fetch user info separately or show UUID
              createdByInfo = {
                id: typeof document.created_by === 'string' ? document.created_by : String(document.created_by),
                name: 'Unknown',
                email: ''
              }
            }
          }
        }
        
        const documentInfo: DocumentInfo = {
          document_id: document.id,
          title: document.title,
          doc_type: document.doc_type,
          status: document.current_version_state || 'DRAFT',
          current_version: currentVersion?.version_string || null,
          current_version_state: document.current_version_state || 'DRAFT',
          created_by: createdByInfo,
          created_at: document.created_at,
          approved_by: null, // TODO: Fetch from approvals
          template_name: currentVersion?.template?.name || null,
          template_version: currentVersion?.template?.version || null,
          file_hash: currentVersion?.file_hash || null,
          pdf_hash: null, // TODO: Add PDF hash if available
          checked_out_by: currentVersion?.locked_by || null,
          checked_out_at: currentVersion?.locked_at || null,
          version_count: versions.length
        }
        
        setInfo(documentInfo)
      })
      .catch(err => {
        console.error('Error loading document info:', err)
        setError(err.response?.data?.detail || 'Failed to load document information')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, documentId])

  const handleDownloadDocx = async () => {
    if (!currentVersionId) {
      alert('No version available for download')
      return
    }
    
    try {
      const endpoint = `/versions/${currentVersionId}/download`
      const token = localStorage.getItem('token')
      const headers: any = {
        'Accept': '*/*'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      const response = await api.get(endpoint, {
        responseType: 'blob',
        headers
      })
      
      // Create blob URL and trigger download
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${info?.title || 'document'}.docx`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Error downloading DOCX:', err)
      alert(err.response?.data?.detail || 'Failed to download document')
    }
  }

  const handleDownloadPdf = async () => {
    // TODO: Implement PDF download when endpoint is available
    alert('PDF download will be available soon')
  }

  if (!isOpen) return null

  return (
    <div className="info-overlay" onClick={onClose}>
      <div className="info-modal" onClick={(e) => e.stopPropagation()}>
        <header className="info-header">
          <h3>Document Information</h3>
          <div className="info-header-actions">
            <button 
              className="info-audit-btn" 
              onClick={() => setShowAuditLog(true)}
              aria-label="View Audit Log"
            >
              📋 Audit Log
            </button>
            <button className="info-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        {loading && (
          <div className="info-loading">
            <div>Loading document information…</div>
          </div>
        )}

        {error && (
          <div className="info-error">
            <div>Error: {error}</div>
          </div>
        )}

        {!loading && !error && info && (
          <div className="info-content">
            {/* Basic Information */}
            <section className="info-section">
              <h4>Basic Information</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Title:</span>
                  <span className="info-value">{info.title}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Type:</span>
                  <span className="info-value">{info.doc_type}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Version:</span>
                  <span className="info-value">{info.current_version || 'N/A'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Status:</span>
                  <span className={`info-badge info-status-${info.status.toLowerCase()}`}>
                    {info.status}
                  </span>
                </div>
              </div>
            </section>

            {/* Creator Information */}
            <section className="info-section">
              <h4>Creator Information</h4>
              {info.created_by ? (
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Created by:</span>
                    <span className="info-value">{info.created_by.name}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Email:</span>
                    <span className="info-value">{info.created_by.email}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Created at:</span>
                    <span className="info-value">
                      {info.created_at ? new Date(info.created_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="info-value">No creator information available</div>
              )}
            </section>

            {/* Template Information */}
            {info.template_name && (
              <section className="info-section">
                <h4>Template Information</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Template:</span>
                    <span className="info-value">{info.template_name}</span>
                  </div>
                  {info.template_version && (
                    <div className="info-item">
                      <span className="info-label">Template Version:</span>
                      <span className="info-value">{info.template_version}</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Version Information */}
            <section className="info-section">
              <h4>Version Information</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Total Versions:</span>
                  <span className="info-value">{info.version_count}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Current Version:</span>
                  <span className="info-value">{info.current_version || 'N/A'}</span>
                </div>
              </div>
            </section>

            {/* File Downloads */}
            <section className="info-section">
              <h4>File Downloads</h4>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  className="info-audit-btn"
                  onClick={handleDownloadDocx}
                  disabled={!currentVersionId}
                  style={{ background: currentVersionId ? '#1976d2' : '#ccc', cursor: currentVersionId ? 'pointer' : 'not-allowed' }}
                >
                  📄 Download DOCX
                </button>
                <button
                  className="info-audit-btn"
                  onClick={handleDownloadPdf}
                  style={{ background: '#666' }}
                >
                  📄 Download PDF
                </button>
              </div>
            </section>

            {/* File Integrity */}
            {info.file_hash && (
              <section className="info-section">
                <h4>File Integrity</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">File Hash (SHA-256):</span>
                    <span className="info-value info-hash">{info.file_hash}</span>
                  </div>
                  {info.pdf_hash && (
                    <div className="info-item">
                      <span className="info-label">PDF Hash (SHA-256):</span>
                      <span className="info-value info-hash">{info.pdf_hash}</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Checkout Information */}
            {info.checked_out_by && (
              <section className="info-section">
                <h4>Checkout Information</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Checked out by:</span>
                    <span className="info-value">{info.checked_out_by}</span>
                  </div>
                  {info.checked_out_at && (
                    <div className="info-item">
                      <span className="info-label">Checked out at:</span>
                      <span className="info-value">
                        {new Date(info.checked_out_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      
      {showAuditLog && (
        <AuditLogModal
          templateId={documentId}
          templateName={info?.title || 'Document'}
          isOpen={showAuditLog}
          onClose={() => setShowAuditLog(false)}
        />
      )}
    </div>
  )
}

