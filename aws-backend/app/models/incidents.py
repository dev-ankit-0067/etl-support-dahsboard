from typing import List

from pydantic import BaseModel


class IncidentSummary(BaseModel):
    open: int
    acknowledged: int
    resolved24h: int
    p1: int
    p2: int
    p3: int


class MttrTrendPoint(BaseModel):
    date: str
    mtta: float
    mttr: float
    incidents: int


class IncidentDistributionItem(BaseModel):
    severity: str
    count: int


class IncidentRecord(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    pipeline: str
    domain: str
    createdAt: str
    owner: str
    age: str


class IncidentList(BaseModel):
    items: List[IncidentRecord]
