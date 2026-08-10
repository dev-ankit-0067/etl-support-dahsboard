from typing import List

from fastapi import APIRouter

from ..models.emr import EMRCluster, EMRRun, EMRKpis
from ..services import emr_service

router = APIRouter(prefix="/emr", tags=["emr"])


@router.get("/clusters", response_model=List[EMRCluster])
def clusters() -> List[EMRCluster]:
    return emr_service.list_clusters()


@router.get("/runs", response_model=List[EMRRun])
def runs() -> List[EMRRun]:
    return emr_service.recent_runs()


@router.get("/kpis", response_model=EMRKpis)
def kpis() -> EMRKpis:
    return emr_service.kpis()
