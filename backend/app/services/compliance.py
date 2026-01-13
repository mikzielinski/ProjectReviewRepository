"""
Compliance mapping service for HIPAA/GxP/GIS standards.
Maps document types to applicable compliance standards.
"""

from typing import List, Set
from enum import Enum


class ComplianceStandard(str, Enum):
    """Compliance standards supported by the system."""
    HIPAA = "HIPAA"  # Health Insurance Portability and Accountability Act
    GxP = "GxP"      # Good Practice guidelines (GMP, GLP, GCP, etc.)
    GIS = "GIS"      # General Information Security
    SOC2 = "SOC2"    # System and Organization Controls 2
    ISO27001 = "ISO27001"  # Information Security Management


# Compliance mapping configuration
# Maps document types to applicable compliance standards
COMPLIANCE_MAPPING = {
    # Product Development Documents
    "PDD": {ComplianceStandard.GxP, ComplianceStandard.HIPAA, ComplianceStandard.GIS},
    "SDD": {ComplianceStandard.GxP, ComplianceStandard.HIPAA, ComplianceStandard.GIS},
    "TSS": {ComplianceStandard.GxP, ComplianceStandard.GIS},
    
    # Test & Validation Documents
    "TEST_PLAN": {ComplianceStandard.GxP, ComplianceStandard.GIS},
    "TEST_REPORT": {ComplianceStandard.GxP, ComplianceStandard.GIS},
    "VALIDATION_REPORT": {ComplianceStandard.GxP, ComplianceStandard.GIS},
    
    # Release & Change Management
    "RELEASE_NOTES": {ComplianceStandard.HIPAA, ComplianceStandard.GIS},
    "CHANGE_REQUEST": {ComplianceStandard.GxP, ComplianceStandard.GIS},
    "CHANGE_CONTROL": {ComplianceStandard.GxP, ComplianceStandard.GIS},
    
    # Risk & Compliance Documents
    "RISK_ASSESSMENT": {ComplianceStandard.GxP, ComplianceStandard.HIPAA, ComplianceStandard.GIS},
    "COMPLIANCE_REPORT": {ComplianceStandard.GxP, ComplianceStandard.HIPAA, ComplianceStandard.GIS},
    
    # Training & Quality
    "SOP": {ComplianceStandard.GxP, ComplianceStandard.GIS},  # Standard Operating Procedure
    "TRAINING_MATERIAL": {ComplianceStandard.GxP, ComplianceStandard.GIS},
    
    # Generic/Other (default to GIS only)
    "OTHER": {ComplianceStandard.GIS},
}


def get_compliance_standards(doc_type: str, include_default: bool = True) -> List[str]:
    """
    Get compliance standards applicable to a document type.
    
    Args:
        doc_type: Document type (e.g., "PDD", "SDD", "TEST_PLAN")
        include_default: If True, always include GIS as baseline compliance
    
    Returns:
        List of compliance standard names (e.g., ["GxP", "HIPAA", "GIS"])
    """
    standards: Set[ComplianceStandard] = set()
    
    # Get standards for the document type
    doc_standards = COMPLIANCE_MAPPING.get(doc_type.upper(), set())
    standards.update(doc_standards)
    
    # Always include GIS as baseline compliance if requested
    if include_default and ComplianceStandard.GIS not in standards:
        standards.add(ComplianceStandard.GIS)
    
    # Return as sorted list of strings
    return sorted([s.value for s in standards])


def add_compliance_mapping(doc_type: str, standards: List[ComplianceStandard]) -> None:
    """
    Add or update compliance mapping for a document type.
    Useful for runtime configuration updates.
    
    Args:
        doc_type: Document type
        standards: List of compliance standards to apply
    """
    COMPLIANCE_MAPPING[doc_type.upper()] = set(standards)


def get_all_compliance_standards() -> List[str]:
    """
    Get list of all supported compliance standards.
    
    Returns:
        List of all compliance standard names
    """
    return [standard.value for standard in ComplianceStandard]


def is_compliant_with(doc_type: str, standard: ComplianceStandard) -> bool:
    """
    Check if a document type is compliant with a specific standard.
    
    Args:
        doc_type: Document type
        standard: Compliance standard to check
    
    Returns:
        True if document type is compliant with the standard
    """
    standards = COMPLIANCE_MAPPING.get(doc_type.upper(), set())
    if standard == ComplianceStandard.GIS:
        # GIS is always applicable (baseline compliance)
        return True
    return standard in standards

