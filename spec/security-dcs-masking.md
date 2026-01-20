# Masking (LLM Privacy Protection)

When data is sent to a third party like an LLM, PII fields must be masked to protect privacy. Non-sensitive data like weight measurements is sent in plaintext so the LLM can analyze it.

## Mask Format
Masks follow the pattern: `{{ TYPE_SID }}` where SID is a cryptographically random hex string.

| Mask Type | Example | Description |
|-----------|---------|-------------|
| MEMBER | `{{ MEMBER_A7F3C1D2E9B8 }}` | Person's full name (used for weight records) |
| MEMBER_NAME | `{{ MEMBER_NAME_4E2B8F1C3A5D }}` | Person's first name |
| MEMBER_SURNAME | `{{ MEMBER_SURNAME_9C1E7A4B2D6F }}` | Person's surname |
| MEMBER_BIRTHDATE | `{{ MEMBER_BIRTHDATE_3B5D8F2A1C4E }}` | Person's birthdate |
| MEMBER_EMAIL | `{{ MEMBER_EMAIL_6A9C2E4B7D1F }}` | Person's email address |
| MEMBER_GENDER | `{{ MEMBER_GENDER_8D3F1A5B7C2E }}` | Person's gender |

## What is Masked vs Plaintext
- **Masked (PII)**: Member names, surnames, birthdates, emails, genders
- **Plaintext**: Weight values, measurement dates (needed for LLM analysis)

## Session ID (SID)
- **Format**: Cryptographically random 12-character hex string (e.g., `A7F3C1D2E9B8`)
- **Generation**: Uses `crypto.getRandomValues()` for true randomness
- **Collision-free**: Each SID is checked against existing SIDs before use
- **Non-reversible**: Cannot derive original ID from SID (no mathematical relationship)
- **Session-scoped**: Same entity gets same SID within a session, different SID across sessions
- **No pattern leakage**: SIDs reveal nothing about the original data or relationships

## PII Protection in Questions
The system uses Named Entity Recognition (NER) to detect PII in user questions:
- **Detection**: Uses `compromise` library to detect names, plus regex for emails/dates
- **Auto-replacement**: Known names are automatically replaced with masks
- **Blocking**: Unknown PII blocks the question from being sent
- **Suggestions**: Users can click to insert mask placeholders

## Weight Measurement LLM Workflow
1. User selects one or more weight records using checkboxes
2. User clicks "Ask LLM" button
3. Browser decrypts member names for selected records
4. Browser creates masks for member names, keeps weight/date plaintext
5. Format: `Measurements from {{ MEMBER_123 }}: 2024-01-15: 75.5kg, 2024-01-22: 74.2kg`
6. Browser decrypts the user's LLM API key
7. Browser sends request directly to LLM API (Gemini)
8. LLM analyzes weight data and responds using mask placeholders
9. Browser unmasks the response by replacing placeholders with actual names
10. User sees both raw (masked) and display (unmasked) responses

## System Prompt
The LLM receives a system prompt explaining the masking convention:
- Instructs LLM to use placeholders in responses (e.g., "{{ MEMBER_123 }} has gained weight...")
- Prevents LLM from guessing actual names behind masks
- Allows analysis of weight trends, patterns, and health insights
- Masks are replaced client-side before displaying to user

## LLM API Key Storage
- API key is encrypted with the user's data key (same encryption as PII data)
- Encrypted key stored in `llm_settings` table per user
- Key is decrypted only in browser memory when making LLM calls
- Server never sees the plaintext API key
