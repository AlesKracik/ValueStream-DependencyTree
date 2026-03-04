# Jira Integration

## Overview
The application integrates with Atlassian Jira to hydrate execution data (Epics) and track customer-linked issues.

## Connection Architecture
To bypass browser CORS restrictions, all Jira API requests are routed through a server-side proxy managed by the Vite development server.

```mermaid
sequenceDiagram
    participant UI as Web Client
    participant Proxy as Vite Proxy
    participant Jira as Atlassian API
    UI->>Proxy: POST /api/jira/search (with JQL & Settings)
    Proxy->>Jira: POST /rest/api/3/search (with JQL)
    Jira-->>Proxy: Raw JSON Data
    Proxy-->>UI: Raw JSON Data
```

All integration endpoints (`/api/jira/issue`, `/api/jira/search`) expect the necessary Jira configuration (`jira_base_url`, `jira_api_token`, etc.) to be passed within the JSON request body. This ensures the proxy remains stateless and can handle requests across different integration environments.


## Data Mapping
The system maps the following fields from Jira to the local model:
- **`Summary`** -> `name`
- **`Target start`** (Custom Field) -> `target_start`
- **`Target end`** (Custom Field) -> `target_end`
- **`Remaining Estimate`** -> `effort_md` (converted to man-days)
- **`Team`** (Custom Field) -> `team_id` (matched via name)

## Customer Issue Tracking
Users can define global JQL queries in the settings to categorize issues:
- **New JQL:** Criteria for unstarted issues.
- **In-Progress JQL:** Criteria for active issues.
- **Noop JQL:** Criteria for closed or irrelevant issues.

## AI Support Health Assistant
The application includes an AI-powered assistant that analyzes customer support tickets to identify root causes and correlations.

### Analysis Context
The assistant receives a structured prompt containing:
- **Jira Ticket Data:** Summaries, descriptions, and the latest comments for New, Active, and Blocked issues.
- **Categorization:** Issues are grouped based on the global JQL queries defined in settings.
- **Findings Requirements:** The AI is instructed to provide a concise summary (2-3 sentences for findings, 1 sentence for conclusion).

### Conversational Memory
The assistant supports multi-turn dialogues. To maintain context, the system:
1. Appends the full previous conversation history to each new prompt.
2. Uses a persistent `sessionId` to support stateful interactions with specific LLM providers (like Augment).

### Real-Time Streaming
For a more responsive experience, the AI analysis is streamed to the UI in real-time. This is supported for:
- **OpenAI:** Via Server-Sent Events (SSE).
- **Gemini:** Via SSE.
- **Augment:** Via a persistent background process on the server that streams CLI output.

## Bulk Sync & Import
- **Sync All Epics:** Iterates through all local epics with a `jira_key` and refreshes their metadata.
- **Import via JQL:** Executes a custom JQL query and creates new Epics (and potentially Work Items) in the local database based on the results.
