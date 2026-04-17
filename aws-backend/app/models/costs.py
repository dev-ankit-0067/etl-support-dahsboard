from typing import Dict, List

from pydantic import BaseModel


class CostKpis(BaseModel):
    totalCostMtd: float
    avgCostPerRun: float
    costOfFailedRuns: float
    budget: float


class CostByPipeline(BaseModel):
    name: str
    cost: float


class CostBreakdown(BaseModel):
    byPipeline: List[CostByPipeline]


class CostTrendPoint(BaseModel):
    date: str
    cost: float


class CostPerformance(BaseModel):
    costVsPipeline: List[CostTrendPoint]
    costRanges: Dict[str, List[CostTrendPoint]]
