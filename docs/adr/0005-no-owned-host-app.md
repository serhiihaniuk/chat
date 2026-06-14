# ADR 0005: No Owned Host App

Status: accepted

The repository does not ship a production host app. Host behavior is represented by the host bridge package and browser widget fixtures.

This keeps the product boundary clear: Side Chat owns the embeddable widget, chat protocol, service, runtime, and persistence; partner applications own their host surfaces and business workflows.
