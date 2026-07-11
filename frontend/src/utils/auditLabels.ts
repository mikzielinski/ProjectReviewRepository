const AUDIT_ACTION_LABELS: Record<string, string> = {
  DOCUMENT_CREATE: 'Document created',
  DOCUMENT_UPDATE: 'Document updated',
  DOCUMENT_DELETE: 'Document deleted',
  DOCUMENT_VIEW: 'Document viewed',
  DOCUMENT_CREATED: 'Document created',
  VERSION_CREATE: 'Version created',
  VERSION_UPDATE: 'Version updated',
  VERSION_SUBMIT: 'Version submitted',
  VERSION_APPROVE: 'Version approved',
  VERSION_REJECT: 'Version rejected',
  TEMPLATE_CREATE: 'Template created',
  TEMPLATE_UPDATE: 'Template updated',
  TEMPLATE_DELETE: 'Template deleted',
  TEMPLATE_APPROVE: 'Template approved',
  TEMPLATE_VIEW: 'Template viewed',
  PROJECT_CREATE: 'Project created',
  PROJECT_UPDATE: 'Project updated',
  PROJECT_DELETE: 'Project deleted',
  MEMBER_INVITE: 'Member invited',
  MEMBER_UPDATE: 'Member updated',
  MEMBER_REMOVE: 'Member removed',
  TASK_CREATE: 'Task created',
  TASK_UPDATE: 'Task updated',
  TASK_COMPLETE: 'Task completed',
  CONTROL_SYNC: 'Controls synchronized',
  CONTROL_TEST: 'Control tested',
  EVIDENCE_UPLOAD: 'Evidence uploaded',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
}

/** Human-readable English label for an audit action code. */
export function getAuditActionLabel(action: string): string {
  if (!action) return ''
  const exact = AUDIT_ACTION_LABELS[action]
  if (exact) return exact
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
