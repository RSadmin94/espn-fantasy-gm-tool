# RFSN-052L — GM Advisor Clear = True Session Reset

**Status:** Implemented locally. Preview after tests. Not Production until explicit ask.

## Bug

Clear removed visible messages but planner + LLM history still influenced the next question.

## Reset on Clear

- UI: messages, pending, input, scroll, in-flight response generation
- Planner: `advisorConversationContext` (owners, intent, scope, league key, follow-ups)
- LLM: persisted `chatHistory` for that user+league
- Deterministic: no prior evidence/entities reused after Clear

## Do not reset

Active ESPN league, logged-in user, selected page/season, Advisor chrome outside the chat transcript.

## Primary regression

1. Who has the most championships?
2. Clear
3. Who has the biggest win?

Step 3 must be league-wide `largest_margin`, as if step 1 never happened.
