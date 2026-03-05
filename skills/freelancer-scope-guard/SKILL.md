---
name: freelancer-scope-guard
description: Detects scope creep in client communications and helps draft professional change-order responses. Use this skill when a client email or message appears to request work outside the original project agreement.
license: MIT
metadata:
  author: lilyTokens
  version: "1.0"
---

# Freelancer Scope Guard

Use this skill when you suspect a client message contains a scope change request. It will help you identify, log, and respond to scope creep professionally.

## Instructions

### Step 1: Identify scope change signals

Read the client message carefully. Look for these phrases:
- "Can you also..." / "While you're at it..."
- "One more thing..." / "Small addition..."
- "Just quickly..." / "It shouldn't take long..."
- "Could you change..." after project scope was agreed

If any of these patterns appear, treat the message as a potential scope change.

### Step 2: Compare against original scope

Check the original project brief or agreement. Ask:
- Is this work described in the original spec?
- Was this discussed and priced before work began?
- Would this require additional time or resources?

If any answer is "no", this is a scope change.

### Step 3: Log the scope change

Record the following:
- Date and time of the request
- Client name / project name
- Description of the requested change (in your words)
- Estimated additional hours required
- Status: PENDING_APPROVAL

### Step 4: Draft a change-order response

Reply to the client professionally:

```
Hi [Client],

Thanks for flagging this. The work you've described — [brief description] — falls outside our original agreement.

I can include it as a change order: approximately [X] hours at [rate]/hr = [total].

Please reply to approve and I'll schedule it. The current delivery timeline remains unchanged pending your decision.

Best,
[Your name]
```

### Step 5: Gate delivery on approval

Do not begin the new work until the client has explicitly approved the change order in writing.

## Guidelines

- Never do out-of-scope work without a written change order first
- Keep change-order language professional and matter-of-fact — not defensive
- If the client pushes back, reference the original agreement
- Track all change orders in a single log (spreadsheet or document)
- A pattern of frequent small changes often signals a larger scope problem — address it directly

## Examples

- Client emails: "Could you also make the logo bigger on mobile?" → Scope change (not in original spec)
- Client emails: "The button isn't working" → Bug fix (likely in scope, check original agreement)
- Client emails: "Can we add a contact form?" → Scope change (new feature)
