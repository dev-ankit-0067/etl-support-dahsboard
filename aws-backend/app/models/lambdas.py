from pydantic import BaseModel


class LambdaKpis(BaseModel):
    totalFunctions: int
    healthy: int
    withErrors: int
    throttled: int
    avgDurationMs: float
    coldStartsPercent: float
    totalInvocations24h: int


class LambdaInvocation(BaseModel):
    id: str
    functionName: str
    status: str
    startTime: str
    endTime: str
    duration: str
    costPerRun: float
