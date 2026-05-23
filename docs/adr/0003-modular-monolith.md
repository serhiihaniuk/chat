# ADR 0003: Modular Monolith

Status: accepted

Side Chat starts as a modular monolith. The app deploys as one partner AI service with internal packages for protocol, partner AI core, agent runtime, DB, client, host bridge, widget, and testing.

This keeps local development and production operations simple while preserving package boundaries that can become service boundaries later. Cross-package relative imports are rejected by governance checks.
