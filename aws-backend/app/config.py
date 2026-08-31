"""Application configuration loaded from environment variables."""
from functools import lru_cache
from typing import List, Optional, Dict, Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. All values configurable via environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- App ----
    app_name: str = "etl-dashboard-api"
    app_env: str = Field(default="production", description="dev | staging | production")
    log_level: str = "INFO"
    api_prefix: str = "/api"
    cors_allow_origins: List[str] = Field(default_factory=lambda: ["*"])

    # ---- AWS ----
    aws_region: str = Field(default="us-east-1", description="Primary AWS region")
    aws_profile: Optional[str] = None
    # Optional explicit creds; otherwise default credential chain is used.
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_session_token: Optional[str] = None

    # boto3 retry / timeouts
    boto_max_attempts: int = 6
    boto_retry_mode: str = "standard"  # legacy | standard | adaptive
    boto_connect_timeout: int = 5
    boto_read_timeout: int = 30

    # ---- Caching ----
    cache_ttl_short: int = 30      # seconds (live status, runs)
    cache_ttl_medium: int = 300    # seconds (KPIs, distributions)
    cache_ttl_long: int = 1800     # seconds (cost explorer, history)
    cache_maxsize: int = 1024

    # ---- Database (log → incident ticket mappings) ----
    # SQLAlchemy URL. SQLite by default; set to Postgres etc. to switch:
    #   DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db
    database_url: str = Field(
        default="sqlite:///./opsguardian.db",
        description="SQLAlchemy database URL (env: DATABASE_URL).",
    )

    # ---- Remote (S3) runtime configuration ----
    # Optional JSON document in S3 that overrides env-based settings at runtime:
    #   { "incidentProvider": "jira|servicenow", "tagKey": "...",
    #     "projects": [{"value": "poc", "s3LogPath": "etl-logs/poc", ...}] }
    # The app re-fetches it every config_refresh_seconds; on fetch failure it
    # keeps the last good copy and falls back to env values when none exists.
    config_s3_bucket: Optional[str] = Field(
        default=None,
        description="S3 bucket holding the JSON runtime configuration document (env: CONFIG_S3_BUCKET).",
    )
    config_s3_key: Optional[str] = Field(
        default=None,
        description="S3 object key of the JSON runtime configuration document (env: CONFIG_S3_KEY).",
    )
    config_refresh_seconds: int = Field(
        default=60,
        description="How often the S3 configuration document is re-fetched (env: CONFIG_REFRESH_SECONDS).",
    )

    # ---- Domain config ----
    glue_job_name_filter: Optional[str] = Field(
        default=None, description="Optional substring to filter Glue jobs by name."
    )
    cost_explorer_tag_key: str = Field(
        default="CostCenter",
        description="Tag key used to group cost explorer queries.",
    )
    sla_breach_minutes: int = 60

    # ---- Project tag filtering ----
    project_tag_key: str = Field(
        default="project",
        description="Resource tag key the project dropdown filters on (case-sensitive).",
    )
    project_values: str = Field(
        default="",
        description="Comma-separated selectable project tag values (env: PROJECT_VALUES=poc,prod).",
    )

    @property
    def project_value_list(self) -> List[str]:
        return [x.strip() for x in self.project_values.split(",") if x.strip()]

    # ---- S3 log source ----
    s3_log_bucket: Optional[str] = Field(
        default=None,
        description="S3 bucket holding custom logs at s3://<bucket>/<project>/<run-id>.log "
        "(env: S3_LOG_BUCKET). Project = the selected project tag value; 'all' lists every prefix.",
    )

    # ---- EMR log groups (CloudWatch) ----
    emr_log_group: Optional[str] = Field(
        default=None,
        description="CloudWatch log group holding EMR-on-EC2 logs (streams keyed by cluster/step id).",
    )
    emr_serverless_log_group: str = Field(
        default="/aws/emr-serverless",
        description="CloudWatch log group holding EMR Serverless job-run logs.",
    )

    # ---- HuggingFace (LLM agents) ----
    huggingface_api_token: Optional[str] = None
    huggingface_model: str = Field(
        default="Qwen/Qwen2.5-72B-Instruct",
        description="HuggingFace model repo ID used by the agents (must support chat completions).",
    )

    # ---- Incident provider selection ----
    incident_provider: str = Field(
        default="jira",
        description="Which ticketing backend to use for incidents/RCA: 'jira' or 'servicenow'. "
        "Selects the MCP server the backend spawns (env: INCIDENT_PROVIDER).",
    )

    @property
    def incident_provider_name(self) -> str:
        return (self.incident_provider or "jira").strip().lower()

    # ---- Jira Integration ----
    jira_url: Optional[str] = None
    jira_username: Optional[str] = None
    jira_api_token: Optional[str] = None
    jira_project_key: str = Field(default="SCRUM", description="Jira project key for incident board")
    use_jira_incidents: bool = Field(default=True, description="Use Jira as incident source instead of SSM for incidents and RCA")
    jira_issue_type: str = Field(default="Bug", description="Jira issue type to track as incidents")
    huggingface_api_token: Optional[str] = None
    huggingface_model_name: str = Field(
        default="meta-llama/Llama-3.1-8B-Instruct",
        description="Hugging Face inference model used for log analysis.",
    )
    jira_status_mapping: dict = Field(
        default_factory=lambda: {"To Do": "Open", "In Progress": "Investigating", "In Review": "Mitigating", "Done": "Resolved"},
        description="Map Jira status to incident status"
    )
    jira_priority_mapping: dict = Field(
        default_factory=lambda: {"Highest": "P1", "High": "P2", "Medium": "P3", "Low": "P4"},
        description="Map Jira priority to severity"
    )

    # ---- ServiceNow Integration (Table API) ----
    servicenow_instance: Optional[str] = Field(
        default=None,
        description="ServiceNow instance base URL, e.g. https://devXXXXX.service-now.com",
    )
    servicenow_user: Optional[str] = None
    servicenow_password: Optional[str] = Field(
        default=None, description="ServiceNow password or API token for basic auth."
    )
    servicenow_table: str = Field(default="incident", description="ServiceNow table to read/create incidents in.")
    servicenow_project_field: str = Field(
        default="u_project",
        description="Incident field used to filter by the selected project value (empty disables filtering).",
    )
    servicenow_issue_priority_default: str = Field(default="3", description="Default ServiceNow priority (1-5) for created incidents.")
    servicenow_priority_mapping: dict = Field(
        default_factory=lambda: {"1": "P1", "2": "P2", "3": "P3", "4": "P4", "5": "P4"},
        description="Map ServiceNow priority value to severity",
    )
    servicenow_status_mapping: dict = Field(
        default_factory=lambda: {
            "1": "Open", "2": "Investigating", "3": "Mitigating",
            "6": "Resolved", "7": "Resolved", "8": "Resolved",
        },
        description="Map ServiceNow incident state value to incident status",
    )

    # ---- Cognito (auth) ----
    cognito_user_pool_id: Optional[str] = Field(default=None, description="Cognito User Pool ID for login.")
    cognito_client_id: Optional[str] = Field(default=None, description="Cognito app client ID (public SPA client).")
    cognito_region: Optional[str] = Field(default=None, description="Cognito region (defaults to aws_region).")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
