"""Structured JSON logging configuration."""
import logging
import sys

from pythonjsonlogger import jsonlogger

from .config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())

    # Quiet down noisy third-party loggers
    for noisy in ("botocore", "urllib3", "boto3", "s3transfer"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
