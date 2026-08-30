# Academic term locking

Terms have an explicit `isLocked` state. When a term is locked, assessment creation and score entry are rejected server-side with `TERM_LOCKED`. This protects academic records even when a client attempts to bypass the UI.
