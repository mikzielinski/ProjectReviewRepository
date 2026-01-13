import { useEffect, useState } from 'react'
import api from '../services/api'
import AuditLogModal from './AuditLogModal'
import './TemplateInfoModal.css'

interface Props {
  templateId: string
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

interface TemplateInfo {
  template_id: string
  name: string
  doc_type: string
  version: string
  status: string
  active_stage: string
  created_by: CreatorInfo | null
  created_at: string | null
  approved_by: ApproverInfo | null
  compliance_standards: string[]
  file_hash: string
  pdf_hash: string | null
  checked_out_by: string | null
  checked_out_at: string | null
}

export default function TemplateInfoModal({
  templateId,
  isOpen,
  onClose
}: Props) {
  const [info, setInfo] = useState<TemplateInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAuditLog, setShowAuditLog] = useState(false)

  useEffect(() => {
    if (!isOpen || !templateId) return

    setLoading(true)
    setError(null)
    
    api.get<TemplateInfo>(`/templates/${templateId}/info`)
      .then(response => {
        setInfo(response.data)
      })
      .catch(err => {
        console.error('Error loading template info:', err)
        setError(err.response?.data?.detail || 'Failed to load template information')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, templateId])

  if (!isOpen) return null

  return (
    <div className="info-overlay" onClick={onClose}>
      <div className="info-modal" onClick={(e) => e.stopPropagation()}>
        <header className="info-header">
          <h3>Template Information</h3>
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
            <div>Loading template information…</div>
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
                  <span className="info-label">Name:</span>
                  <span className="info-value">{info.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Type:</span>
                  <span className="info-value">{info.doc_type}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Version:</span>
                  <span className="info-value">{info.version}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Status:</span>
                  <span className={`info-badge info-status-${info.status.toLowerCase()}`}>
                    {info.status}
                  </span>
                </div>
              </div>
            </section>

            {/* Workflow & Stage */}
            <section className="info-section">
              <h4>Workflow & Stage</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Active Stage:</span>
                  <span className="info-value">{info.active_stage}</span>
                </div>
              </div>
            </section>

            {/* Creator Information */}
            <section className="info-section">
              <h4>Creator Information</h4>
              {info.created_by ? (
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Uploaded by:</span>
                    <span className="info-value">{info.created_by.name}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Email:</span>
                    <span className="info-value">{info.created_by.email}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Uploaded at:</span>
                    <span className="info-value">
                      {info.created_at ? new Date(info.created_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="info-value">No creator information available</div>
              )}
            </section>

            {/* Approver Information */}
            {(info.approved_by || info.status === 'APPROVED') && (
              <section className="info-section">
                <h4>Approval Information</h4>
                {info.approved_by ? (
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Approved by:</span>
                      <span className="info-value">{info.approved_by.name}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Email:</span>
                      <span className="info-value">{info.approved_by.email}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Approved at:</span>
                      <span className="info-value">
                        {info.approved_by.approved_at 
                          ? new Date(info.approved_by.approved_at).toLocaleString() 
                          : 'N/A'}
                      </span>
                    </div>
                    {info.approved_by.comment && (
                      <div className="info-item info-item-full">
                        <span className="info-label">Comment:</span>
                        <span className="info-value">{info.approved_by.comment}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="info-value">
                    Template is approved, but approval details are not available in audit log.
                  </div>
                )}
              </section>
            )}

            {/* Compliance Standards */}
            <section className="info-section">
              <h4>Compliance Standards</h4>
              <div className="compliance-badges">
                {info.compliance_standards.map((standard) => (
                  <span key={standard} className={`compliance-badge compliance-${standard.toLowerCase()}`}>
                    {standard}
                  </span>
                ))}
              </div>
              <div className="compliance-note">
                This template follows {info.compliance_standards.join(', ')} governance rules.
              </div>
            </section>

            {/* File Integrity */}
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
          templateId={templateId}
          templateName={info?.name || 'Template'}
          isOpen={showAuditLog}
          onClose={() => setShowAuditLog(false)}
        />
      )}
    </div>
  )
}
