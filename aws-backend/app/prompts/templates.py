"""AI prompt templates for log analysis and incident key findings."""
from langchain_core.prompts import ChatPromptTemplate

ANALYSIS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are an AI assistant that analyzes CloudWatch log output. "
        "Identify the most likely root cause, highlight any error patterns, and suggest the next debugging steps. "
        "Keep the response concise and actionable."
    ),
    (
        "human",
        "Resource type: {resource_label}\n"
        "Resource name: {resource_name}\n\n"
        "Log output:\n"
        "{log_text}\n\n"
        "Response format: Provide a short summary and then a few bullet-style next steps."
    ),
])

KEY_FINDINGS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are an AI assistant that extracts concise key findings from an ETL incident. "
        "Return the most important 3-6 findings as short bullet points"
        "Keep each finding actionable and specific."
    ),
    (
        "human",
        "Incident title: {title}\n"
        "Description: {description}\n\n"
        "Additional notes:\n{notes}\n\n"
        "Respond with:3-6 bullet points of the key findings."
    ),
])
