from typing import Optional

from pydantic import BaseModel


class EMRCluster(BaseModel):
    id: str
    name: str
    state: str
    createdAt: str


class EMRRun(BaseModel):
    id: str
    clusterId: str
    clusterName: Optional[str] = None
    name: str
    status: str
    startTime: str
    endTime: Optional[str]
    duration: Optional[str]
    serviceType: str = "classic"
    cost: float = 0.0


class EMRKpis(BaseModel):
    totalClusters: int
    activeClusters: int
    failedClusters: int
