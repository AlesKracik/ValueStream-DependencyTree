# Documentation Index

This index organises the ValueStream Dependency Tree documentation from high-level architecture down to operational details.

## Quick Start

- [README](../README.md) — Project introduction, prerequisites, and local development setup.

## Architecture

- [Architecture Overview](ARCHITECTURE.md) — System components, data model, state management, and core algorithms.
- [AI Guide](AI-guide.md) — Condensed codebase map for AI assistants (domain entities, code locations, common workflows).

## Domain Entities

Each entity corresponds to a layer in the value-stream pipeline:

| Layer | Document | Description |
|-------|----------|-------------|
| Demand | [Customers](CUSTOMERS.md) | TCV lifecycle, visual representation, support issues |
| Strategy | [Work Items](WORKITEMS.md) | RICE scoring, customer targeting, historical TCV binding |
| Execution | [Issues](ISSUES.md) | Gantt bars, effort distribution, sprint overrides |
| Supply | [Teams](TEAMS.md) | Capacity logic, holiday impact, LDAP member sync |
| Time | [Sprints](SPRINTS.md) | Fiscal quarters, archiving, planning configuration |
| Filtering | [ValueStreams](VALUESTREAMS.md) | Persistent views, server/client filter pipeline |

## Operations

- [Deployment](DEPLOYMENT.md) — Local development, Docker, Kubernetes, and SSH/SOCKS5 networking.
- [Persistence](PERSISTENCE.md) — MongoDB configuration, authentication methods (SCRAM, AWS IAM/SSO, OIDC), and migrations.
- [Secret Management](SECRET-MANAGEMENT.md) — AES-256-GCM encryption, provider selection, key rotation.

## Integrations

- [Jira](JIRA-INTEGRATION.md) — Issue synchronization, data mapping, customer support tracking.
- [AI / LLM](AI-INTEGRATION.md) — Multi-provider gateway (OpenAI, Gemini, Augment) and Glean OAuth.
- [Aha!](AHA-INTEGRATION.md) — Feature linking from Aha! product roadmaps.
- LDAP — Team member sync; documented in [Teams > LDAP Sync](TEAMS.md#ldap-sync).
- AWS SSO — Device-code authentication for MongoDB; documented in [Persistence > AWS IAM](PERSISTENCE.md#2-aws-iam).

## Reference

- [API Reference](API-REFERENCE.md) — Complete REST endpoint catalogue.
- [User Guide](../web-client/public/USER_GUIDE.md) — End-user documentation (served by the application).
