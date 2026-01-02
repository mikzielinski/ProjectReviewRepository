import enum


class RoleCode(str, enum.Enum):
    ORG_ADMIN = "ORG_ADMIN"
    BUSINESS_OWNER = "Business Owner"
    ARCHITECT = "Architect"
    QA = "QA Officer"
    RELEASE_MANAGER = "Release Manager"
    SME = "SME"
    AUDITOR = "Auditor"
    # Note: PM and DEV removed - use custom roles from RACI instead


class TemplateStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    ARCHIVED = "ARCHIVED"


class DocumentState(str, enum.Enum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    RELEASED = "RELEASED"
    ARCHIVED = "ARCHIVED"


class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class TaskStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    VERIFIED = "VERIFIED"
    CLOSED = "CLOSED"
    BLOCKED = "BLOCKED"


class ReminderStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DONE = "DONE"


class GateStatus(str, enum.Enum):
    OPEN = "OPEN"
    BLOCKED = "BLOCKED"
    READY = "READY"
    CLOSED = "CLOSED"


class GateType(str, enum.Enum):
    PDD_APPROVAL = "PDD_APPROVAL"
    SDD_APPROVAL = "SDD_APPROVAL"
    TSS_APPROVAL = "TSS_APPROVAL"
    TEST_EXECUTION = "TEST_EXECUTION"
    RELEASE_GO_NOGO = "RELEASE_GO_NOGO"


class GanttItemType(str, enum.Enum):
    TASK_GROUP = "TASK_GROUP"
    APPROVAL_GATE = "APPROVAL_GATE"
    MILESTONE = "MILESTONE"
    EVIDENCE_GATE = "EVIDENCE_GATE"
    RELEASE_GATE = "RELEASE_GATE"


class GanttItemStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    APPROVED = "APPROVED"
    BLOCKED = "BLOCKED"
    DONE = "DONE"


class EvidenceType(str, enum.Enum):
    TEST_REPORT = "TEST_REPORT"
    RUN_REPORT = "RUN_REPORT"
    CODE_REVIEW_REPORT = "CODE_REVIEW_REPORT"
    SCREENSHOT = "SCREENSHOT"
    LOG_EXPORT = "LOG_EXPORT"
    OTHER = "OTHER"


class LinkedToType(str, enum.Enum):
    DOCUMENT_VERSION = "DOCUMENT_VERSION"
    TASK = "TASK"
    GATE = "GATE"


class AIRunType(str, enum.Enum):
    PKB_EXTRACT = "PKB_EXTRACT"
    DOC_DRAFT = "DOC_DRAFT"
    IMPACT_ANALYSIS = "IMPACT_ANALYSIS"

