# Notion Form Specification (Cycle 1)

## Workspace Structure
- shared page: `Applied AI Labs - Cycle 01`
- visible section: focus question + submit button
- submit target: Notion Form view of `Idea Intake`

## Form UX Copy
Title: `Share Your Idea`
Prompt: `Share one idea in 3-6 sentences. Be concrete.`
Support text: `You can submit more than once as your thinking evolves.`

## Notion Database: `Idea Intake`
Required student field:
- `Idea` (rich text or long text)

System/prefilled fields:
- `Cycle ID` (`cycle_01`)
- `Focus ID` (`ai_fluency_root`)
- `Focus Question` (fixed text for cycle 1)
- `Created time` (Notion system)
- `Last edited time` (Notion system)
- `Created by` (Notion system)

## Behavioral Rules
1. Students do not edit database views directly.
2. Form submissions are the canonical intake mode.
3. Form allows multiple submissions.
4. If a response is edited later, pipeline stores it as a new version.

## Operations Notes
- sharing and workspace permissions are managed in Notion
- security and enforcement remain server-side in runtime/Supabase
