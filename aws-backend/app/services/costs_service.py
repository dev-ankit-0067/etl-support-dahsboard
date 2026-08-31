"""AWS Cost Explorer-backed cost data."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings
from . import tags_service
from ..models.costs import (
    CostBreakdown,
    CostByPipeline,
    CostKpis,
    CostPerformance,
    CostTrendPoint,
    ServiceTrend,
    ServiceTrendSeries,
)

log = logging.getLogger(__name__)


def _ce_client():
    return client("ce")


def _project_filter():
    """Cost Explorer tag filter for the active project, or None when unfiltered."""
    project = tags_service.active_project()
    if not project:
        return None
    return {"Tags": {"Key": get_settings().project_tag_key, "Values": [project]}}


def _merge_filter(existing: Optional[dict]) -> Optional[dict]:
    pf = _project_filter()
    if pf is None:
        return existing
    if existing is None:
        return pf
    return {"And": [existing, pf]}


def _today() -> date:
    return datetime.utcnow().date()


def _month_start() -> date:
    return _today().replace(day=1)


def _fetch_grouped(start: date, end: date, group_key: str, granularity: str = "DAILY"):
    ce = _ce_client()
    try:
        flt = _merge_filter(None)
        resp = ce.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity=granularity,
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "TAG", "Key": group_key}],
            **({"Filter": flt} if flt else {}),
        )
    except (BotoCoreError, ClientError) as exc:
        log.error("CostExplorer get_cost_and_usage failed: %s", exc)
        raise
    return resp


@cached("long")
def kpis() -> CostKpis:
    settings = get_settings()
    today = _today()
    start = _month_start()
    end = today + timedelta(days=1)
    ce = _ce_client()

    # Previous month window (day 1 → last day of last month).
    last_month_end = start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    try:
        flt = _merge_filter(None)
        total = ce.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            **({"Filter": flt} if flt else {}),
        )
        # Daily last-month series so we can split full-month vs same-period actuals.
        lm_resp = ce.get_cost_and_usage(
            TimePeriod={
                "Start": last_month_start.isoformat(),
                "End": (last_month_end + timedelta(days=1)).isoformat(),
            },
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
            **({"Filter": flt} if flt else {}),
        )
        budgets = client("budgets").describe_budgets(
            AccountId=client("sts").get_caller_identity()["Account"],
            MaxResults=10,
        )
    except (BotoCoreError, ClientError) as exc:
        log.error("kpis aggregation failed: %s", exc)
        raise

    total_cost = float(
        total["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"] or 0.0
    )

    last_month_total = 0.0
    last_month_same_period = 0.0
    for r in lm_resp.get("ResultsByTime", []):
        amount = float(r["Total"]["UnblendedCost"]["Amount"] or 0.0)
        last_month_total += amount
        if int(r["TimePeriod"]["Start"].split("-")[2]) <= today.day:
            last_month_same_period += amount

    budget_amount = 0.0
    for b in budgets.get("Budgets", []):
        if settings.cost_explorer_tag_key in (b.get("Name", "")):
            budget_amount = float(b.get("BudgetLimit", {}).get("Amount", 0.0))
            break
    if budget_amount == 0.0 and budgets.get("Budgets"):
        budget_amount = float(
            budgets["Budgets"][0].get("BudgetLimit", {}).get("Amount", 0.0)
        )

    # AWS forecast for the rest of the month; end-of-month = MTD actual + forecast.
    # Falls back to a linear day-rate extrapolation when the forecast API is
    # unavailable (e.g. not enough billing history).
    forecast = round(_forecast_month_end(ce, flt, today, start, total_cost), 2)

    return CostKpis(
        totalCostMtd=round(total_cost, 2),
        lastMonthTotal=round(last_month_total, 2),
        lastMonthSamePeriod=round(last_month_same_period, 2),
        forecast=forecast,
        budget=round(budget_amount or total_cost * 1.2, 2),
    )


def _forecast_month_end(ce, flt, today: date, month_start: date, total_cost: float) -> float:
    """End-of-month projection: MTD actual + AWS GetCostForecast for the rest.

    Falls back to the current daily run-rate extrapolation when the forecast
    API reports that no forecast is available yet.
    """
    month_end = today.replace(day=28) + timedelta(days=4)
    month_end = month_end.replace(day=1) - timedelta(days=1)  # last day of month
    try:
        fc = ce.get_cost_forecast(
            TimePeriod={"Start": today.isoformat(), "End": month_end.isoformat()},
            Metric="UNBLENDED_COST",
            Granularity="MONTHLY",
            **({"Filter": flt} if flt else {}),
        )
        remaining = float(fc["Total"]["Amount"] or 0.0)
        return total_cost + remaining
    except (BotoCoreError, ClientError) as exc:
        log.warning("GetCostForecast unavailable; using day-rate extrapolation: %s", exc)
        days_in_month = (month_end - month_start).days + 1
        daily = total_cost / max(today.day, 1)
        return daily * days_in_month


@cached("long")
def breakdown(top_n: int = 10) -> CostBreakdown:
    settings = get_settings()
    start = _month_start()
    end = _today() + timedelta(days=1)
    resp = _fetch_grouped(start, end, settings.cost_explorer_tag_key, granularity="MONTHLY")
    pipeline_costs: dict = {}
    for window in resp.get("ResultsByTime", []):
        for grp in window.get("Groups", []):
            key = (grp.get("Keys") or ["unknown"])[0]
            name = key.split("$", 1)[-1] or "unknown"
            amount = float(grp["Metrics"]["UnblendedCost"]["Amount"] or 0.0)
            pipeline_costs[name] = pipeline_costs.get(name, 0.0) + amount
    items = sorted(
        ({"name": k, "cost": round(v, 2)} for k, v in pipeline_costs.items()),
        key=lambda x: x["cost"],
        reverse=True,
    )[:top_n]
    return CostBreakdown(byPipeline=[CostByPipeline(**i) for i in items])


def _trend(days: int) -> List[CostTrendPoint]:
    ce = _ce_client()
    end = _today() + timedelta(days=1)
    start = end - timedelta(days=days)
    try:
        flt = _merge_filter(None)
        resp = ce.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
            **({"Filter": flt} if flt else {}),
        )
    except (BotoCoreError, ClientError) as exc:
        log.error("trend(%d) failed: %s", days, exc)
        raise
    out: List[CostTrendPoint] = []
    for r in resp.get("ResultsByTime", []):
        out.append(
            CostTrendPoint(
                date=r["TimePeriod"]["Start"],
                cost=round(float(r["Total"]["UnblendedCost"]["Amount"] or 0.0), 2),
            )
        )
    return out


@cached("long")
def performance() -> CostPerformance:
    weekly = _trend(7)
    monthly = _trend(30)
    today_pt = weekly[-1:] if weekly else []
    return CostPerformance(
        costVsPipeline=weekly,
        costRanges={"today": today_pt, "7d": weekly, "30d": monthly},
    )


def _trend_by_service(days: int, service: str) -> List[CostTrendPoint]:
    """Fetch cost trend for a specific AWS service."""
    ce = _ce_client()
    end = _today() + timedelta(days=1)
    start = end - timedelta(days=days)
    try:
        resp = ce.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
            Filter=_merge_filter({"Dimensions": {"Key": "SERVICE", "Values": [service]}}),
        )
    except (BotoCoreError, ClientError) as exc:
        log.error("trend_by_service(%d, %s) failed: %s", days, service, exc)
        return []
    out: List[CostTrendPoint] = []
    for r in resp.get("ResultsByTime", []):
        out.append(
            CostTrendPoint(
                date=r["TimePeriod"]["Start"],
                cost=round(float(r["Total"]["UnblendedCost"]["Amount"] or 0.0), 2),
            )
        )
    return out


@cached("long")
def service_trend() -> ServiceTrend:
    """Get cost trends for Glue and Lambda services over 7d, 30d, and 60d windows."""
    def build_range(days: int) -> ServiceTrendSeries:
        glue = _trend_by_service(days, "AWS Glue")
        lambda_ = _trend_by_service(days, "AWS Lambda")
        # Combine both services
        combined = []
        for i, g in enumerate(glue):
            if i < len(lambda_):
                combined.append(
                    CostTrendPoint(
                        date=g.date,
                        cost=round(g.cost + lambda_[i].cost, 2),
                    )
                )
        return ServiceTrendSeries(glue=glue, lambda_=lambda_, all=combined)

    return ServiceTrend(
        ranges_7d=build_range(7),
        ranges_30d=build_range(30),
        ranges_60d=build_range(60),
        ranges_90d=build_range(90),
    )
