import { useState, useEffect } from 'react'
import api from '../services/api'
import './ProjectSetupWizard.css'
import './ComplianceInfoModal.css'

interface ProjectSetupWizardProps {
  project?: any // Existing project for editing
  onComplete: (projectData: any) => void
  onCancel: () => void
}

interface Folder {
  id: string
  name: string
  subfolders?: Folder[]
}

interface DocumentType {
  id: string
  code: string
  name: string
}

interface User {
  id: string
  name: string
  email: string
}

const ProjectSetupWizard: React.FC<ProjectSetupWizardProps> = ({ project, onComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(1)
  const [folders, setFolders] = useState<Folder[]>([])
  const [groupedDocumentTypes, setGroupedDocumentTypes] = useState<any[]>([])
  const [users, setUsers] = useState<User[]>([])
  
  // Available roles for escalation
  const availableRoles = [
    'ORG_ADMIN',
    'BUSINESS_OWNER',
    'ARCHITECT',
    'QA',
    'RELEASE_MANAGER',
    'SME',
    'AUDITOR',
    'PM'
  ]
  
  // Step 1: Basic Info
  const [basicInfo, setBasicInfo] = useState({
    key: project?.key || '',
    name: project?.name || '',
    status: project?.status || 'ACTIVE',
    folder_id: project?.folder_id || '',
    enable_4_eyes_principal: project?.enable_4_eyes_principal || false
  })
  
  // Invited users (for team members to invite)
  const [invitedUsers, setInvitedUsers] = useState<Array<{user_id: string, role_code: string}>>([])

  // Step 2: Document Types
  const [projectDocumentTypes, setProjectDocumentTypes] = useState<any[]>(
    project?.required_document_types_json || []
  )
  const [skipDocumentTypes, setSkipDocumentTypes] = useState(false)

  // Step 3: Retention Policy
  const [retentionPolicy, setRetentionPolicy] = useState<any>(project?.retention_policy_json || {
    enabled: false,
    retention_period_days: null,
    archive_after_days: null,
    delete_after_days: null
  })
  const [skipRetention, setSkipRetention] = useState(false)

  // Step 4: Approval Policies
  const [approvalPolicies, setApprovalPolicies] = useState<any>(project?.approval_policies_json || {
    document_type_approvals: []
  })
  const [skipApproval, setSkipApproval] = useState(false)

  // Step 5: Escalation Chain
  const [escalationChain, setEscalationChain] = useState<any>(project?.escalation_chain_json || {
    enabled: false,
    escalation_levels: []
  })
  const [skipEscalation, setSkipEscalation] = useState(false)

  // Step 6: Team Members (optional)
  // (invitedUsers state already defined above)

  // Step 7: Compliance Settings
  const [complianceSettings, setComplianceSettings] = useState<any>(project?.compliance_settings_json || {
    hipaa: false,
    sox: false,
    gxp: false,
    gisc: false
  })
  const [skipCompliance, setSkipCompliance] = useState(false)
  const [showComplianceModal, setShowComplianceModal] = useState<string | null>(null) // 'hipaa', 'sox', 'gxp', 'gisc'
  const [showComplianceQuiz, setShowComplianceQuiz] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<any>({
    industry: '',
    dataType: '',
    financial: false,
    healthcare: false,
    clinical: false,
    security: false
  })

  // Step 8: RACI Matrix
  const defaultRaciStages = [
    { name: 'Discovery', tasks: [] },
    { name: 'Design', tasks: [] },
    { name: 'Implementation', tasks: [] }
  ]
  const [raciMatrix, setRaciMatrix] = useState<any>(project?.raci_matrix_json || {
    stages: []
  })
  const [skipRaci, setSkipRaci] = useState(false)

  const totalSteps = 8

  useEffect(() => {
    loadFolders()
    loadDocumentTypes()
    loadUsers()
  }, [])

  const loadFolders = async () => {
    try {
      const response = await api.get('/folders')
      setFolders(response.data || [])
    } catch (error) {
      console.error('Failed to load folders:', error)
    }
  }

  const loadDocumentTypes = async () => {
    try {
      const response = await api.get('/document-types')
      const allTypes: DocumentType[] = response.data || []
      
      // Group DATA_MAP_* types together
      const dataMapTypes = allTypes.filter((dt: DocumentType) => dt.code.startsWith('DATA_MAP_'))
      const otherTypes = allTypes.filter((dt: DocumentType) => !dt.code.startsWith('DATA_MAP_'))
      
      const grouped: any[] = []
      
      // Add other types
      otherTypes.forEach(dt => {
        grouped.push({
          id: dt.id,
          code: dt.code,
          name: dt.name,
          isGroup: false,
          subTypes: []
        })
      })
      
      // Add grouped DATA_MAP types
      if (dataMapTypes.length > 0) {
        grouped.push({
          id: 'DATA_MAP_GROUP',
          code: 'DATA_MAP',
          name: 'Project Data Mapping',
          isGroup: true,
          subTypes: dataMapTypes
        })
      }
      
      setGroupedDocumentTypes(grouped)
    } catch (error) {
      console.error('Failed to load document types:', error)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await api.get('/users')
      setUsers(response.data || [])
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  // Render folders as tree with indentation
  const renderFolderOption = (folder: Folder, level: number = 0): JSX.Element => {
    // Use visual prefix to show hierarchy (select doesn't support padding well)
    // Use non-breaking spaces and dashes for better visibility
    const indent = level > 0 ? '\u00A0\u00A0'.repeat(level) + '└─ ' : ''
    return (
      <option key={folder.id} value={folder.id}>
        {indent}{folder.name}
      </option>
    )
  }

  const renderFolderTreeOptions = (folders: Folder[], level: number = 0): JSX.Element[] => {
    const options: JSX.Element[] = []
    folders.forEach(folder => {
      if (folder.id) {
        options.push(renderFolderOption(folder, level))
      }
      if (folder.subfolders && folder.subfolders.length > 0) {
        options.push(...renderFolderTreeOptions(folder.subfolders, level + 1))
      }
    })
    return options
  }

  const handleDocumentTypeToggle = (docType: any) => {
    if (docType.isGroup) {
      // Handle grouped DATA_MAP types
      const allDataMapSelected = docType.subTypes.every((subType: DocumentType) =>
        projectDocumentTypes.some(dt => dt.document_type_id === subType.id)
      )
      
      if (allDataMapSelected) {
        // Remove all DATA_MAP types
        const dataMapIds = docType.subTypes.map((st: DocumentType) => st.id)
        setProjectDocumentTypes(projectDocumentTypes.filter(dt => !dataMapIds.includes(dt.document_type_id)))
        // Remove from approval policies
        setApprovalPolicies({
          ...approvalPolicies,
          document_type_approvals: approvalPolicies.document_type_approvals?.filter(
            (a: any) => !dataMapIds.includes(a.document_type_id)
          ) || []
        })
      } else {
        // Add all DATA_MAP types
        const newTypes = docType.subTypes.map((subType: DocumentType) => ({
          document_type_id: subType.id,
          document_type_code: subType.code,
          document_type_name: subType.name,
          update_frequency: 'NEVER',
          document_creator_user_id: null
        }))
        setProjectDocumentTypes([...projectDocumentTypes, ...newTypes])
      }
    } else {
      // Handle regular document type
      const exists = projectDocumentTypes.find(dt => dt.document_type_id === docType.id)
      if (exists) {
        setProjectDocumentTypes(projectDocumentTypes.filter(dt => dt.document_type_id !== docType.id))
        // Also remove from approval policies
        setApprovalPolicies({
          ...approvalPolicies,
          document_type_approvals: approvalPolicies.document_type_approvals?.filter(
            (a: any) => a.document_type_id !== docType.id
          ) || []
        })
      } else {
        setProjectDocumentTypes([
          ...projectDocumentTypes,
          {
            document_type_id: docType.id,
            document_type_code: docType.code,
            document_type_name: docType.name,
            update_frequency: 'NEVER',
            document_creator_user_id: null
          }
        ])
      }
    }
  }

  const handleDocumentTypeFrequencyChange = (docTypeId: string, frequency: string, isGroup: boolean = false) => {
    if (isGroup) {
      // Update frequency for all DATA_MAP types
      const dataMapGroup = groupedDocumentTypes.find(gdt => gdt.id === 'DATA_MAP_GROUP')
      if (dataMapGroup) {
        const dataMapIds = dataMapGroup.subTypes.map((st: DocumentType) => st.id)
        setProjectDocumentTypes(projectDocumentTypes.map(dt => 
          dataMapIds.includes(dt.document_type_id)
            ? { ...dt, update_frequency: frequency }
            : dt
        ))
      }
    } else {
      setProjectDocumentTypes(projectDocumentTypes.map(dt => 
        dt.document_type_id === docTypeId 
          ? { ...dt, update_frequency: frequency }
          : dt
      ))
    }
  }
  
  const isDocumentTypeSelected = (docType: any): boolean => {
    if (docType.isGroup) {
      // Check if all subTypes are selected
      return docType.subTypes.every((subType: DocumentType) =>
        projectDocumentTypes.some(dt => dt.document_type_id === subType.id)
      )
    } else {
      return projectDocumentTypes.some(dt => dt.document_type_id === docType.id)
    }
  }
  
  const getDocumentTypeFrequency = (docType: any): string => {
    if (docType.isGroup) {
      // Get frequency from first selected DATA_MAP type (they should all have the same)
      const firstSelected = docType.subTypes.find((subType: DocumentType) =>
        projectDocumentTypes.some(dt => dt.document_type_id === subType.id)
      )
      if (firstSelected) {
        const selected = projectDocumentTypes.find(dt => dt.document_type_id === firstSelected.id)
        return selected?.update_frequency || 'NEVER'
      }
      return 'NEVER'
    } else {
      const selected = projectDocumentTypes.find(dt => dt.document_type_id === docType.id)
      return selected?.update_frequency || 'NEVER'
    }
  }

  const handleNext = () => {
    if (currentStep === 1) {
      // Validate basic info
      if (!basicInfo.key.trim() || !basicInfo.name.trim()) {
        alert('Please fill in all required fields (Key and Name)')
        return
      }
    }
    
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    } else {
      handleFinish()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    if (currentStep === 2) setSkipDocumentTypes(true)
    if (currentStep === 3) setSkipRetention(true)
    if (currentStep === 4) setSkipApproval(true)
    if (currentStep === 5) setSkipEscalation(true)
    if (currentStep === 6) {/* Skip team members - no skip state needed */}
    if (currentStep === 7) setSkipCompliance(true)
    if (currentStep === 8) setSkipRaci(true)
    
    handleNext()
  }

  const handleFinish = () => {
    const projectData: any = {
      ...basicInfo,
      required_document_types_json: skipDocumentTypes ? null : projectDocumentTypes,
      retention_policy_json: skipRetention ? null : retentionPolicy,
      approval_policies_json: skipApproval ? null : approvalPolicies,
      escalation_chain_json: skipEscalation ? null : escalationChain,
      compliance_settings_json: skipCompliance ? null : complianceSettings,
      raci_matrix_json: skipRaci ? null : raciMatrix,
      invited_users: invitedUsers.length > 0 ? invitedUsers : null
    }
    onComplete(projectData)
  }

  const handleStepClick = (step: number) => {
    // Allow clicking steps only in edit mode
    if (project && step >= 1 && step <= totalSteps) {
      setCurrentStep(step)
    }
  }

  const addApprovalRule = (docTypeId: string) => {
    const existing = approvalPolicies.document_type_approvals?.find((a: any) => a.document_type_id === docTypeId)
    if (!existing) {
    setApprovalPolicies({
      ...approvalPolicies,
        document_type_approvals: [
          ...(approvalPolicies.document_type_approvals || []),
          {
            document_type_id: docTypeId,
            reviewer_user_id: null,
            approver_user_id: null,
            allow_creator_as_reviewer: false,
            allow_creator_as_approver: false
          }
        ]
      })
    }
  }

  const removeApprovalRule = (docTypeId: string) => {
    setApprovalPolicies({
      ...approvalPolicies,
      document_type_approvals: approvalPolicies.document_type_approvals?.filter(
        (a: any) => a.document_type_id !== docTypeId
      ) || []
    })
  }

  const updateApprovalRule = (docTypeId: string, field: string, value: any) => {
    setApprovalPolicies({
      ...approvalPolicies,
      document_type_approvals: approvalPolicies.document_type_approvals?.map((a: any) =>
        a.document_type_id === docTypeId ? { ...a, [field]: value } : a
      ) || []
    })
  }

  const loadDefaultRaci = () => {
    setRaciMatrix({ stages: [...defaultRaciStages] })
  }

  const addEscalationLevel = () => {
    setEscalationChain({
      ...escalationChain,
      escalation_levels: [
        ...(escalationChain.escalation_levels || []),
        { days_after: null, notify_role: '', notify_users: [] }
      ]
    })
  }

  const removeEscalationLevel = (index: number) => {
    setEscalationChain({
      ...escalationChain,
      escalation_levels: escalationChain.escalation_levels.filter((_: any, i: number) => i !== index)
    })
  }

  const addRaciStage = () => {
    setRaciMatrix({
      ...raciMatrix,
      stages: [
        ...(raciMatrix.stages || []),
        { name: '', tasks: [] }
      ]
    })
  }

  const removeRaciStage = (index: number) => {
    setRaciMatrix({
      ...raciMatrix,
      stages: raciMatrix.stages.filter((_: any, i: number) => i !== index)
    })
  }

  // Compliance info data
  const complianceInfo: Record<string, any> = {
    hipaa: {
      title: 'HIPAA (Health Insurance Portability and Accountability Act)',
      description: 'HIPAA is a US federal law that establishes national standards to protect sensitive patient health information.',
      characteristics: [
        'Protects Protected Health Information (PHI) including medical records, health plan information, and payment data',
        'Requires administrative, physical, and technical safeguards',
        'Mandates access controls and audit trails',
        'Requires Business Associate Agreements (BAAs) with third-party service providers',
        'Enforces breach notification requirements'
      ],
      appliesTo: [
        'Healthcare providers (hospitals, clinics, physicians)',
        'Health plans and insurance companies',
        'Healthcare clearinghouses',
        'Business associates handling PHI',
        'Any system storing or transmitting patient health information'
      ],
      keyRequirements: [
        'Access controls and authentication',
        'Encryption of PHI in transit and at rest',
        'Audit logs for all PHI access',
        'Workforce training on HIPAA compliance',
        'Risk assessments and security management processes'
      ]
    },
    sox: {
      title: 'SOX (Sarbanes-Oxley Act)',
      description: 'SOX is a US federal law that sets requirements for public companies regarding financial reporting, internal controls, and corporate governance.',
      characteristics: [
        'Focuses on accuracy and reliability of financial reporting',
        'Requires management assessment of internal controls',
        'Mandates independent auditor attestation',
        'Enforces executive accountability for financial statements',
        'Requires documentation of financial processes and controls'
      ],
      appliesTo: [
        'Publicly traded companies (US and foreign companies trading on US exchanges)',
        'Public accounting firms',
        'Management and boards of directors',
        'Financial reporting systems and processes',
        'Internal control systems'
      ],
      keyRequirements: [
        'Internal control documentation and testing',
        'Management assessment of controls (Section 404)',
        'Independent auditor attestation',
        'CEO/CFO certification of financial statements',
        'Retention of audit records and documentation'
      ]
    },
    gxp: {
      title: 'GxP (Good Practice Guidelines)',
      description: 'GxP refers to a collection of quality guidelines and regulations that ensure products are safe, meet their intended use, and adhere to quality processes. Common types include GMP (Good Manufacturing Practice), GLP (Good Laboratory Practice), and GCP (Good Clinical Practice).',
      characteristics: [
        'Focuses on product quality, safety, and efficacy',
        'Requires comprehensive documentation and record-keeping',
        'Mandates validation of processes, equipment, and systems',
        'Enforces change control and deviation management',
        'Requires personnel training and qualification'
      ],
      appliesTo: [
        'Pharmaceutical companies',
        'Medical device manufacturers',
        'Biotechnology companies',
        'Clinical research organizations (CROs)',
        'Contract manufacturing organizations (CMOs)',
        'Laboratories conducting GLP studies'
      ],
      keyRequirements: [
        'Documentation and records management',
        'Process validation and verification',
        'Change control procedures',
        'Equipment qualification and calibration',
        'Personnel training and competency',
        'Quality assurance and quality control systems',
        'Batch records and traceability'
      ]
    },
    gisc: {
      title: 'GISC (Good Information Security Controls)',
      description: 'GISC represents best practices for information security management, focusing on protecting information assets, ensuring confidentiality, integrity, and availability of data.',
      characteristics: [
        'Comprehensive information security management system (ISMS)',
        'Risk-based approach to security',
        'Continuous monitoring and improvement',
        'Incident response and business continuity planning',
        'Security awareness and training programs'
      ],
      appliesTo: [
        'Organizations handling sensitive information',
        'Systems requiring strong security controls',
        'Critical infrastructure and business processes',
        'Data protection and privacy requirements',
        'Information security management'
      ],
      keyRequirements: [
        'Information security policies and procedures',
        'Access control and identity management',
        'Network security and encryption',
        'Security monitoring and incident response',
        'Vulnerability management and patching',
        'Security awareness training',
        'Regular security assessments and audits'
      ]
    }
  }

  // Quiz suggestion logic
  const calculateComplianceSuggestions = (answers: any) => {
    const suggestions: any = { hipaa: false, sox: false, gxp: false, gisc: false }
    
    // Industry-based suggestions
    if (answers.industry === 'healthcare' || answers.healthcare) {
      suggestions.hipaa = true
    }
    if (answers.industry === 'pharmaceutical' || answers.industry === 'medical_device' || answers.clinical) {
      suggestions.gxp = true
    }
    if (answers.industry === 'financial' || answers.financial) {
      suggestions.sox = true
    }
    
    // Data type-based suggestions
    if (answers.dataType === 'patient_health' || answers.dataType === 'healthcare') {
      suggestions.hipaa = true
    }
    if (answers.dataType === 'financial_reporting' || answers.dataType === 'accounting') {
      suggestions.sox = true
    }
    if (answers.dataType === 'clinical_trial') {
      suggestions.gxp = true
    }
    
    // General security requirement
    if (answers.security) {
      suggestions.gisc = true
    }
    
    return suggestions
  }

  const handleQuizComplete = () => {
    const suggestions = calculateComplianceSuggestions(quizAnswers)
    setComplianceSettings(suggestions)
    setShowComplianceQuiz(false)
  }

  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard-modal">
        <div className="setup-wizard-header">
          <h2>{project ? 'Edit Project' : 'Project Setup Wizard'}</h2>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        {/* Progress Bar */}
        <div className="setup-wizard-progress">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => (
            <div
              key={step}
              className={`progress-step ${step === currentStep ? 'active' : ''} ${step < currentStep ? 'completed' : ''} ${project ? 'clickable' : ''}`}
              onClick={() => handleStepClick(step)}
              style={project ? { cursor: 'pointer' } : {}}
              title={project ? `Click to go to step ${step}` : ''}
            >
              <div className="step-number">{step}</div>
              <div className="step-label">
                {step === 1 && 'Basic Info'}
                {step === 2 && 'Documents'}
                {step === 3 && 'Retention'}
                {step === 4 && 'Approval'}
                {step === 5 && 'Escalation'}
                {step === 6 && 'Team'}
                {step === 7 && 'Compliance'}
                {step === 8 && 'RACI'}
              </div>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="setup-wizard-content">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="wizard-step">
              <h3>Basic Information</h3>
              <p className="step-description">Provide the essential project details (required)</p>
              
              <div className="form-group">
                <label>Project Key <span className="required">*</span></label>
                <input
                  type="text"
                  value={basicInfo.key}
                  onChange={(e) => setBasicInfo({ ...basicInfo, key: e.target.value })}
                  placeholder="e.g., PROJ-001"
                  required
                  disabled={!!project}
                />
                <small>Unique identifier for the project (cannot be changed)</small>
              </div>

              <div className="form-group">
                <label>Project Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={basicInfo.name}
                  onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
                  placeholder="e.g., New Product Development"
                  required
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={basicInfo.status}
                  onChange={(e) => setBasicInfo({ ...basicInfo, status: e.target.value })}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div className="form-group">
                <label>Folder (Optional)</label>
                <select
                  value={basicInfo.folder_id}
                  onChange={(e) => setBasicInfo({ ...basicInfo, folder_id: e.target.value })}
                >
                  <option value="">-- None --</option>
                  {renderFolderTreeOptions(folders)}
                </select>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={basicInfo.enable_4_eyes_principal}
                    onChange={(e) => setBasicInfo({ ...basicInfo, enable_4_eyes_principal: e.target.checked })}
                  />
                  Enable 4 Eyes Principal
                </label>
                <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                  When enabled, the document creator cannot be the reviewer or approver, and one person can only have one role (reviewer OR approver, not both).
                  This ensures proper separation of duties and quality control.
                </small>
              </div>
            </div>
          )}

          {/* Step 2: Document Types */}
          {currentStep === 2 && (
            <div className="wizard-step">
              <h3>Required Document Types</h3>
              <p className="step-description">
                Select which types of documents are required for this project and how often they need to be updated (optional - you can skip this)
              </p>

              <div className="form-group">
                <label>Select Document Types</label>
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                  {groupedDocumentTypes.map((docType) => {
                    const selected = isDocumentTypeSelected(docType)
                    const frequency = getDocumentTypeFrequency(docType)
                    return (
                      <div key={docType.id} style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={(e) => {
                          e.preventDefault()
                          handleDocumentTypeToggle(docType)
                        }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleDocumentTypeToggle(docType)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                          />
                          <strong>{docType.name}</strong> {!docType.isGroup && `(${docType.code})`}
                          {docType.isGroup && (
                            <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '0.5rem' }}>
                              ({docType.subTypes.length} types: {docType.subTypes.map((st: DocumentType) => st.code).join(', ')})
                            </span>
                          )}
                        </div>
                        {selected && (
                          <div style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                Update Frequency:
                              </label>
                              <select
                                value={frequency}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  handleDocumentTypeFrequencyChange(docType.id, e.target.value, docType.isGroup)
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '100%', padding: '0.5rem' }}
                              >
                                <option value="NEVER">Never</option>
                                <option value="ONCE_YEAR">Once a Year</option>
                                <option value="QUARTERLY">Quarterly</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="WEEKLY">Weekly</option>
                              </select>
                            </div>
                            {!docType.isGroup && (
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                  Document Creator (Optional):
                                </label>
                                <select
                                  value={projectDocumentTypes.find(dt => dt.document_type_id === docType.id)?.document_creator_user_id || ''}
                                  onChange={(e) => {
                                    e.stopPropagation()
                                    setProjectDocumentTypes(projectDocumentTypes.map(dt => 
                                      dt.document_type_id === docType.id
                                        ? { ...dt, document_creator_user_id: e.target.value || null }
                                        : dt
                                    ))
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ width: '100%', padding: '0.5rem' }}
                                >
                                  <option value="">-- Select Document Creator --</option>
                                  {users.map(user => (
                                    <option key={user.id} value={user.id}>
                                      {user.name} ({user.email})
                                    </option>
                                  ))}
                                </select>
                                <small style={{ display: 'block', marginTop: '0.25rem', color: '#666', fontSize: '0.8rem' }}>
                                  This user will be the default creator for documents of this type and will be automatically invited to the project.
                                </small>
                              </div>
                            )}
                            {docType.isGroup && (
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                  Document Creator for all DATA_MAP types (Optional):
                                </label>
                                <select
                                  value={projectDocumentTypes.find(dt => docType.subTypes.some((st: DocumentType) => st.id === dt.document_type_id))?.document_creator_user_id || ''}
                                  onChange={(e) => {
                                    e.stopPropagation()
                                    const dataMapIds = docType.subTypes.map((st: DocumentType) => st.id)
                                    setProjectDocumentTypes(projectDocumentTypes.map(dt => 
                                      dataMapIds.includes(dt.document_type_id)
                                        ? { ...dt, document_creator_user_id: e.target.value || null }
                                        : dt
                                    ))
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ width: '100%', padding: '0.5rem' }}
                                >
                                  <option value="">-- Select Document Creator --</option>
                                  {users.map(user => (
                                    <option key={user.id} value={user.id}>
                                      {user.name} ({user.email})
                                    </option>
                                  ))}
                                </select>
                                <small style={{ display: 'block', marginTop: '0.25rem', color: '#666', fontSize: '0.8rem' }}>
                                  This user will be the default creator for all Project Data Mapping document types and will be automatically invited to the project.
                                </small>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {groupedDocumentTypes.length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
                      No document types available
                    </div>
                  )}
                </div>
              </div>

              <div className="skip-note">
                💡 <strong>Don't know?</strong> You can configure required documents later or skip to set them up later.
              </div>
            </div>
          )}

          {/* Step 3: Retention Policy */}
          {currentStep === 3 && (
            <div className="wizard-step">
              <h3>Retention Policy</h3>
              <p className="step-description">
                Configure how long documents are retained (optional - you can skip this)
              </p>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={retentionPolicy.enabled}
                    onChange={(e) => setRetentionPolicy({ ...retentionPolicy, enabled: e.target.checked })}
                  />
                  Enable Retention Policy
                </label>
                <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                  Retention Policy determines how long documents are kept before archiving or deletion. 
                  Useful for compliance with data retention regulations (e.g., GDPR, HIPAA).
                  <br />
                  <strong>Retention Period:</strong> How long to keep documents active (e.g., 365 days = 1 year)
                  <br />
                  <strong>Archive After:</strong> Move documents to archive after this period (e.g., 730 days = 2 years)
                  <br />
                  <strong>Delete After:</strong> Permanently delete documents after this period (e.g., 2555 days = 7 years)
                </small>
              </div>

              {retentionPolicy.enabled && (
                <>
                  <div className="form-group">
                    <label>Retention Period (days)</label>
                    <input
                      type="number"
                      value={retentionPolicy.retention_period_days || ''}
                      onChange={(e) => setRetentionPolicy({ ...retentionPolicy, retention_period_days: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="e.g., 365"
                      min="1"
                    />
                    <small>How long to keep documents before archiving</small>
                  </div>

                  <div className="form-group">
                    <label>Archive After (days)</label>
                    <input
                      type="number"
                      value={retentionPolicy.archive_after_days || ''}
                      onChange={(e) => setRetentionPolicy({ ...retentionPolicy, archive_after_days: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="e.g., 730"
                      min="1"
                    />
                    <small>Move to archive after this many days</small>
                  </div>

                  <div className="form-group">
                    <label>Delete After (days)</label>
                    <input
                      type="number"
                      value={retentionPolicy.delete_after_days || ''}
                      onChange={(e) => setRetentionPolicy({ ...retentionPolicy, delete_after_days: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="e.g., 2555"
                      min="1"
                    />
                    <small>Permanently delete after this many days (7 years = 2555 days)</small>
                  </div>
                </>
              )}

              <div className="skip-note">
                💡 <strong>Don't know?</strong> You can configure this later or skip to use default settings.
              </div>
            </div>
          )}

          {/* Step 4: Approval Policies */}
          {currentStep === 4 && (
            <div className="wizard-step">
              <h3>Approval Policies</h3>
              <p className="step-description">
                Define who reviews and approves each document type (optional - you can skip this)
              </p>

              <div className="form-group">
                <label>Document Type Approval Rules</label>
                {projectDocumentTypes.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '4px' }}>
                    Please select document types in step 2 first
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {projectDocumentTypes.map((docType) => {
                      const approvalRule = approvalPolicies.document_type_approvals?.find(
                        (a: any) => a.document_type_id === docType.document_type_id
                      )
                      return (
                        <div key={docType.document_type_id} style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <strong>{docType.document_type_name} ({docType.document_type_code})</strong>
                            {!approvalRule && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => addApprovalRule(docType.document_type_id)}
                              >
                                + Add Approval Rule
                              </button>
                            )}
                          </div>
                          {approvalRule && (
                            <>
                              {!basicInfo.enable_4_eyes_principal && (
                                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label>
                  <input
                    type="checkbox"
                                      checked={approvalRule.allow_creator_as_reviewer || false}
                                      onChange={(e) => updateApprovalRule(docType.document_type_id, 'allow_creator_as_reviewer', e.target.checked)}
                  />
                                    Allow document creator as reviewer
                </label>
              </div>
                              )}
                <div className="form-group">
                                <label>Reviewer (User)</label>
                                <select
                                  value={approvalRule.reviewer_user_id || ''}
                        onChange={(e) => {
                                    const newReviewerId = e.target.value || null
                                    // If 4 eyes enabled, ensure reviewer is not the same as approver
                                    if (basicInfo.enable_4_eyes_principal && newReviewerId && approvalRule.approver_user_id === newReviewerId) {
                                      alert('Reviewer and Approver must be different people when 4 Eyes Principal is enabled')
                                      return
                                    }
                                    updateApprovalRule(docType.document_type_id, 'reviewer_user_id', newReviewerId)
                                  }}
                                  style={{ width: '100%' }}
                                >
                                  <option value="">-- Select Reviewer --</option>
                                  {users.map(user => (
                                    <option 
                                      key={user.id} 
                                      value={user.id}
                                      disabled={basicInfo.enable_4_eyes_principal && approvalRule.approver_user_id === user.id}
                                    >
                                      {user.name} ({user.email})
                                      {basicInfo.enable_4_eyes_principal && approvalRule.approver_user_id === user.id ? ' (already selected as Approver)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {!basicInfo.enable_4_eyes_principal && (
                                <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                                      checked={approvalRule.allow_creator_as_approver || false}
                                      onChange={(e) => updateApprovalRule(docType.document_type_id, 'allow_creator_as_approver', e.target.checked)}
                                    />
                                    Allow document creator as approver
                      </label>
                    </div>
                              )}
                              <div className="form-group">
                                <label>Approver (User) <span className="required">*</span></label>
                                <select
                                  value={approvalRule.approver_user_id || ''}
                                  onChange={(e) => {
                                    const newApproverId = e.target.value || null
                                    // If 4 eyes enabled, ensure approver is not the same as reviewer
                                    if (basicInfo.enable_4_eyes_principal && newApproverId && approvalRule.reviewer_user_id === newApproverId) {
                                      alert('Reviewer and Approver must be different people when 4 Eyes Principal is enabled')
                                      return
                                    }
                                    updateApprovalRule(docType.document_type_id, 'approver_user_id', newApproverId)
                                  }}
                                  style={{ width: '100%' }}
                                  required
                                >
                                  <option value="">-- Select Approver --</option>
                                  {users.map(user => (
                                    <option 
                                      key={user.id} 
                                      value={user.id}
                                      disabled={basicInfo.enable_4_eyes_principal && approvalRule.reviewer_user_id === user.id}
                                    >
                                      {user.name} ({user.email})
                                      {basicInfo.enable_4_eyes_principal && approvalRule.reviewer_user_id === user.id ? ' (already selected as Reviewer)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {basicInfo.enable_4_eyes_principal && (
                                <div style={{ padding: '0.75rem', background: '#e3f2fd', borderRadius: '4px', fontSize: '0.9rem', color: '#1976d2', marginTop: '0.5rem' }}>
                                  ⚠️ 4 Eyes Principal is enabled: Creator cannot be reviewer or approver, and reviewer/approver must be different people.
                                </div>
                              )}
                  <button
                    type="button"
                                className="btn-remove"
                                onClick={() => removeApprovalRule(docType.document_type_id)}
                  >
                                Remove Approval Rule
                  </button>
                            </>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
              </div>

              <div className="skip-note">
                💡 <strong>Don't know?</strong> You can configure approval workflows later or skip to use default settings.
              </div>
            </div>
          )}

          {/* Step 5: Escalation Chain */}
          {currentStep === 5 && (
            <div className="wizard-step">
              <h3>Escalation Chain</h3>
              <p className="step-description">
                Define who gets notified when approvals are overdue (optional - you can skip this)
              </p>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={escalationChain.enabled}
                    onChange={(e) => setEscalationChain({ ...escalationChain, enabled: e.target.checked })}
                  />
                  Enable Escalation Notifications
                </label>
                <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                  When enabled, notifications will be sent to specified roles/users when approvals are overdue.
                  Configure escalation levels below to define who gets notified and after how many days.
                </small>
              </div>

              {escalationChain.enabled && (
                <div className="form-group">
                  <label>Escalation Levels</label>
                  {escalationChain.escalation_levels?.map((level: any, index: number) => (
                    <div key={index} className="array-item">
                      <input
                        type="number"
                        placeholder="Days after deadline"
                        value={level.days_after || ''}
                        onChange={(e) => {
                          const levels = [...escalationChain.escalation_levels]
                          levels[index] = { ...level, days_after: e.target.value ? parseInt(e.target.value) : null }
                          setEscalationChain({ ...escalationChain, escalation_levels: levels })
                        }}
                        min="1"
                      />
                      <select
                        value={level.notify_role || ''}
                        onChange={(e) => {
                          const levels = [...escalationChain.escalation_levels]
                          levels[index] = { ...level, notify_role: e.target.value || '' }
                          setEscalationChain({ ...escalationChain, escalation_levels: levels })
                        }}
                        style={{ flex: 1, padding: '0.5rem' }}
                      >
                        <option value="">-- Select Role --</option>
                        {availableRoles.map(role => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeEscalationLevel(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-add"
                    onClick={addEscalationLevel}
                  >
                    + Add Escalation Level
                  </button>
                </div>
              )}

              <div className="skip-note">
                💡 <strong>Don't know?</strong> You can configure escalation rules later or skip to use default settings.
              </div>
            </div>
          )}

          {/* Step 6: Team Members (Optional) */}
          {currentStep === 6 && (
            <div className="wizard-step">
              <h3>Team Members</h3>
              <p className="step-description">
                Invite team members to the project (optional - you can skip this and invite members later)
              </p>

              <div className="form-group">
                <label>Invite Users</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {invitedUsers.map((invite, index) => (
                    <div key={index} className="array-item">
                      <select
                        value={invite.user_id}
                        onChange={(e) => {
                          const updated = [...invitedUsers]
                          updated[index].user_id = e.target.value
                          setInvitedUsers(updated)
                        }}
                        style={{ flex: 1 }}
                      >
                        <option value="">-- Select User --</option>
                        {users.map(user => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.email})
                          </option>
                        ))}
                      </select>
                      <select
                        value={invite.role_code}
                        onChange={(e) => {
                          const updated = [...invitedUsers]
                          updated[index].role_code = e.target.value
                          setInvitedUsers(updated)
                        }}
                        style={{ minWidth: '150px' }}
                      >
                        <option value="BUSINESS_OWNER">Business Owner</option>
                        <option value="ARCHITECT">Architect</option>
                        <option value="QA">QA</option>
                        <option value="RELEASE_MANAGER">Release Manager</option>
                        <option value="SME">SME</option>
                        <option value="AUDITOR">Auditor</option>
                        <option value="PM">PM</option>
                      </select>
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => setInvitedUsers(invitedUsers.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-add"
                    onClick={() => setInvitedUsers([...invitedUsers, { user_id: '', role_code: 'SME' }])}
                  >
                    + Add Team Member
                  </button>
                </div>
              </div>

              <div className="skip-note">
                💡 <strong>Don't know?</strong> You can invite team members later from the Team tab in the project.
              </div>
            </div>
          )}

          {/* Step 7: Compliance Settings */}
          {currentStep === 7 && (
            <div className="wizard-step">
              <h3>Compliance Settings</h3>
              <p className="step-description">
                Select which compliance standards apply to this project (optional - you can skip this)
              </p>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label>Compliance Standards</label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowComplianceQuiz(true)}
                    style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                  >
                    🎯 Not sure? Take a quiz
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                    <input
                      type="checkbox"
                      checked={complianceSettings.hipaa || false}
                      onChange={(e) => setComplianceSettings({ ...complianceSettings, hipaa: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.25rem', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '1rem' }}>HIPAA</strong>
                        <button
                          type="button"
                          onClick={() => setShowComplianceModal('hipaa')}
                          style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', padding: 0 }}
                        >
                          ℹ️ Learn more
                        </button>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                        Health Insurance Portability and Accountability Act - applies to healthcare data and patient information
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                    <input
                      type="checkbox"
                      checked={complianceSettings.sox || false}
                      onChange={(e) => setComplianceSettings({ ...complianceSettings, sox: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.25rem', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '1rem' }}>SOX</strong>
                        <button
                          type="button"
                          onClick={() => setShowComplianceModal('sox')}
                          style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', padding: 0 }}
                        >
                          ℹ️ Learn more
                        </button>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                        Sarbanes-Oxley Act - applies to financial reporting and accounting controls
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                    <input
                      type="checkbox"
                      checked={complianceSettings.gxp || false}
                      onChange={(e) => setComplianceSettings({ ...complianceSettings, gxp: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.25rem', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '1rem' }}>GxP</strong>
                        <button
                          type="button"
                          onClick={() => setShowComplianceModal('gxp')}
                          style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', padding: 0 }}
                        >
                          ℹ️ Learn more
                        </button>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                        Good Practice guidelines (GMP, GLP, GCP) - applies to pharmaceutical, medical device, and clinical research industries
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                    <input
                      type="checkbox"
                      checked={complianceSettings.gisc || false}
                      onChange={(e) => setComplianceSettings({ ...complianceSettings, gisc: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.25rem', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '1rem' }}>GISC</strong>
                        <button
                          type="button"
                          onClick={() => setShowComplianceModal('gisc')}
                          style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', padding: 0 }}
                        >
                          ℹ️ Learn more
                        </button>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                        Good Information Security Controls - applies to information security management
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="skip-note">
                💡 <strong>Don't know?</strong> Click "Take a quiz" above to get personalized recommendations based on your project characteristics.
              </div>
            </div>
          )}

          {/* Step 8: RACI Matrix */}
          {currentStep === 8 && (
            <div className="wizard-step">
              <h3>RACI Matrix</h3>
              <p className="step-description">
                Define responsibility assignments (Responsible, Accountable, Consulted, Informed) (optional - you can skip this)
              </p>

              <div className="form-group">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={loadDefaultRaci}
                >
                  {raciMatrix.stages.length === 0 ? 'Load Default RACI Matrix' : 'Reset to Default RACI Matrix'}
                </button>
                <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                  {raciMatrix.stages.length === 0 
                    ? 'Load a default RACI matrix with common stages (Discovery, Design, Implementation). You can edit it after loading.'
                    : 'Reset to default RACI matrix with common stages (Discovery, Design, Implementation). Your current stages will be replaced.'}
                </small>
              </div>

              {raciMatrix.stages.length > 0 && (
                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                  <label>Project Stages</label>
                  <small style={{ display: 'block', marginBottom: '0.75rem', color: '#666' }}>
                    You can edit the stage names and add tasks after project creation. Click on a stage to modify it.
                  </small>
                  {raciMatrix.stages?.map((stage: any, index: number) => (
                    <div key={index} className="array-item">
                      <input
                        type="text"
                        placeholder="Stage name (e.g., Design, Development, Testing)"
                        value={stage.name}
                        onChange={(e) => {
                          const stages = [...raciMatrix.stages]
                          stages[index] = { ...stage, name: e.target.value }
                          setRaciMatrix({ ...raciMatrix, stages })
                        }}
                      />
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeRaciStage(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-add"
                    onClick={addRaciStage}
                  >
                  + Add Project Stage
                  </button>
                  <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                    You can add tasks and assign RACI roles for each stage after project creation.
                  </small>
                </div>
              )}

              <div className="skip-note">
                💡 <strong>Don't know?</strong> You can configure RACI matrix later or skip to set it up later.
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="setup-wizard-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          
          <div className="wizard-actions">
            {currentStep > 1 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePrevious}
              >
                ← Previous
              </button>
            )}
            
            {currentStep < totalSteps && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSkip}
                style={{ marginLeft: '0.5rem' }}
              >
                Skip Step
              </button>
            )}
            
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNext}
              style={{ marginLeft: '0.5rem' }}
            >
              {currentStep === totalSteps ? 'Finish' : 'Next →'}
            </button>
          </div>
        </div>
      </div>

      {/* Compliance Info Modal */}
      {showComplianceModal && (
        <div className="compliance-modal-overlay" onClick={() => setShowComplianceModal(null)}>
          <div className="compliance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="compliance-modal-header">
              <h3>{complianceInfo[showComplianceModal]?.title || 'Compliance Information'}</h3>
              <button className="compliance-modal-close" onClick={() => setShowComplianceModal(null)}>×</button>
            </div>
            <div className="compliance-modal-content">
              {complianceInfo[showComplianceModal] && (
                <>
                  <div className="compliance-info-section">
                    <h4>Description</h4>
                    <p>{complianceInfo[showComplianceModal].description}</p>
                  </div>
                  <div className="compliance-info-section">
                    <h4>Key Characteristics</h4>
                    <ul>
                      {complianceInfo[showComplianceModal].characteristics.map((char: string, idx: number) => (
                        <li key={idx}>{char}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="compliance-info-section">
                    <h4>Applies To</h4>
                    <ul>
                      {complianceInfo[showComplianceModal].appliesTo.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="compliance-info-section">
                    <h4>Key Requirements</h4>
                    <ul>
                      {complianceInfo[showComplianceModal].keyRequirements.map((req: string, idx: number) => (
                        <li key={idx}>{req}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compliance Quiz Modal */}
      {showComplianceQuiz && (
        <div className="compliance-modal-overlay" onClick={() => setShowComplianceQuiz(false)}>
          <div className="compliance-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="compliance-modal-header">
              <h3>Compliance Quiz - Find the Right Standards</h3>
              <button className="compliance-modal-close" onClick={() => setShowComplianceQuiz(false)}>×</button>
            </div>
            <div className="compliance-modal-content">
              <p style={{ marginBottom: '1.5rem', color: '#666', fontSize: '0.95rem' }}>
                Answer the following questions to get personalized compliance standard recommendations for your project.
              </p>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '1rem', color: '#333' }}>
                  1. What industry does your project operate in?
                </label>
                <select
                  value={quizAnswers.industry}
                  onChange={(e) => setQuizAnswers({ ...quizAnswers, industry: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="">-- Select Industry --</option>
                  <option value="healthcare">Healthcare / Medical Services</option>
                  <option value="pharmaceutical">Pharmaceutical</option>
                  <option value="medical_device">Medical Device</option>
                  <option value="financial">Financial Services</option>
                  <option value="technology">Technology / IT</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '1rem', color: '#333' }}>
                  2. What type of data does your project handle?
                </label>
                <select
                  value={quizAnswers.dataType}
                  onChange={(e) => setQuizAnswers({ ...quizAnswers, dataType: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="">-- Select Data Type --</option>
                  <option value="patient_health">Patient Health Information (PHI)</option>
                  <option value="financial_reporting">Financial Reporting / Accounting Data</option>
                  <option value="clinical_trial">Clinical Trial Data</option>
                  <option value="manufacturing">Manufacturing / Production Data</option>
                  <option value="sensitive_business">Sensitive Business Information</option>
                  <option value="general">General Business Data</option>
                </select>
              </div>

              <div style={{ marginTop: '1.5rem', marginBottom: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #e0e0e0' }}>
                <label style={{ display: 'block', marginBottom: '1rem', fontWeight: '600', fontSize: '1rem', color: '#333' }}>
                  Additional questions (select all that apply):
                </label>

                <div className="form-group" style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={quizAnswers.financial}
                      onChange={(e) => setQuizAnswers({ ...quizAnswers, financial: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.2rem', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '0.95rem', color: '#333', lineHeight: '1.5' }}>
                      Does your project involve financial reporting or accounting controls?
                    </span>
                  </label>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={quizAnswers.healthcare}
                      onChange={(e) => setQuizAnswers({ ...quizAnswers, healthcare: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.2rem', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '0.95rem', color: '#333', lineHeight: '1.5' }}>
                      Does your project handle healthcare data or patient information?
                    </span>
                  </label>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={quizAnswers.clinical}
                      onChange={(e) => setQuizAnswers({ ...quizAnswers, clinical: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.2rem', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '0.95rem', color: '#333', lineHeight: '1.5' }}>
                      Does your project involve clinical research, pharmaceutical, or medical device development?
                    </span>
                  </label>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={quizAnswers.security}
                      onChange={(e) => setQuizAnswers({ ...quizAnswers, security: e.target.checked })}
                      style={{ marginRight: '0.75rem', marginTop: '0.2rem', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '0.95rem', color: '#333', lineHeight: '1.5' }}>
                      Does your project require strong information security controls?
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e0e0e0', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowComplianceQuiz(false)}
                  style={{ padding: '0.75rem 1.5rem', fontSize: '0.95rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleQuizComplete}
                  style={{ padding: '0.75rem 1.5rem', fontSize: '0.95rem' }}
                >
                  Apply Suggestions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectSetupWizard
