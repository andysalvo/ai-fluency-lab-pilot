# Applied AI Labs Warehouse Manifesto (v1)

## What We Are Building
We are building a simple idea warehouse for one research question at a time.

For cycle 1, students submit short ideas in Notion. The system stores those ideas in Supabase, adds embeddings, and makes the dataset queryable for structured analysis.

This is not an autonomous agent system. It is a governed pipeline for collecting and organizing student thinking.

## Why This Matters
Most student AI discussions disappear in chats and documents. We need a durable, analyzable record of ideas across a cohort.

The warehouse gives us:
- a clean intake path people can actually use
- append-only history of submissions
- comparable data across one cycle and across multiple cycles
- a foundation for rigorous analysis without hiding governance decisions

## What We Are Not Building in v1
- not a full AI copilot in the student workflow
- not a complex "agent OS" frontstage
- not autonomous publishing or autonomous decisions

## Design Principles
1. Keep input friction low: one form, one required idea field.
2. Keep storage rigorous: idempotent ingest, append-only versions.
3. Keep governance explicit: human approval remains required for protected actions.
4. Keep language plain: readable by students, operators, and faculty.
5. Keep scope realistic: 3 to 20 students in one cycle first.

## Focus Question (Cycle 1)
How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?
