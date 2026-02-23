# Cycle 01 System Rationale

## Institutional Problem
Student AI conversations are high volume but low memory. Ideas are scattered across chats, docs, and class channels, then disappear.  
When norms and tools shift every semester, cohorts lose continuity and restart from scratch.

Without durable intake, student AI fluency stays episodic and personality-driven instead of cohort-structured.

## v1 System Claim
Applied AI Labs Warehouse v1 is a reliability-first epistemic intake system:
- one shared focus question
- one low-friction Notion form input
- append-only storage in Supabase
- embeddings for operator-side analysis

v1 is limited to archival intake and operator-side analysis.

## Why This Design Is Necessary
The lab needs longitudinal memory before it needs more automation.  
If intake is unreliable, every later insight layer is noise.

The first milestone is not “smarter generation.”  
The first milestone is trustworthy capture: every idea version is retained, attributable, and queryable.

## Explicit Tradeoffs
1. One focus question per cycle:
   - gain: comparability across submissions
   - cost: less topic breadth in a single cycle
2. Whitespace-only normalization:
   - gain: auditability and replay safety
   - cost: less semantic cleanup at ingest time
3. Operator-side analysis first:
   - gain: governance clarity and controlled interpretation
   - cost: student-facing feedback loops come later

## Cycle 01 Focus Question
How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?
