"""Clinical Analytics router for the staff dashboard."""
from fastapi import APIRouter

from app.services.analytics import calculate_clinical_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/clinical")
def get_clinical_analytics():
    """Returns real operational metrics, care plan progress, task distributions, and attention triage."""
    return calculate_clinical_analytics()
