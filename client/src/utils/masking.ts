// Masking utility for LLM requests
// SID = Cryptographically random, collision-free identifiers

// SID lookup maps for bidirectional mapping within session
const sidToOriginal = new Map<string, { type: string; id: number }>();
const originalToSid = new Map<string, string>(); // "type:id" -> sid

// Generate a cryptographically random SID
function generateRandomSID(): string {
  const array = new Uint8Array(6); // 6 bytes = 12 hex chars
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Generate collision-free SID for entity type and id
export function generateSID(entityType: string, id: number): string {
  const key = `${entityType}:${id}`;

  // Check if we already have a SID for this entity (deterministic within session)
  const existing = originalToSid.get(key);
  if (existing) {
    return existing;
  }

  // Generate new random SID, ensuring no collision
  let sid: string;
  let attempts = 0;
  do {
    sid = generateRandomSID();
    attempts++;
    if (attempts > 100) {
      throw new Error('Failed to generate unique SID after 100 attempts');
    }
  } while (sidToOriginal.has(sid));

  // Register bidirectional mapping
  sidToOriginal.set(sid, { type: entityType, id });
  originalToSid.set(key, sid);

  return sid;
}

// Generate and register SID (same as generateSID now, kept for API compatibility)
export function generateAndRegisterSID(entityType: string, id: number): string {
  return generateSID(entityType, id);
}

// Parse SID back to get the original id (only works within same session)
export function parseSID(sid: string): { type: string; id: number } | null {
  return sidToOriginal.get(sid) || null;
}

// Clear all SID mappings (useful for testing or session reset)
export function clearSIDMappings(): void {
  sidToOriginal.clear();
  originalToSid.clear();
}

// Mask types for different fields
export type MaskType =
  | 'MEMBER'
  | 'MEMBER_NAME'
  | 'MEMBER_SURNAME'
  | 'MEMBER_BIRTHDATE'
  | 'MEMBER_EMAIL'
  | 'MEMBER_GENDER';

// Create a mask placeholder
export function createMask(type: MaskType, id: number): string {
  const sid = generateAndRegisterSID(type, id);
  return `{{ ${type}_${sid} }}`;
}

// Extract mask info from a mask string
export function parseMask(mask: string): { type: MaskType; sid: string } | null {
  const match = mask.match(/\{\{\s*(\w+)_([A-F0-9]+)\s*\}\}/);
  if (match) {
    return {
      type: match[1] as MaskType,
      sid: match[2]
    };
  }
  return null;
}

// Mask mapping for unmasking responses
export interface MaskMapping {
  mask: string;
  originalValue: string;
}

// Create masked data for a member record
export function maskMemberData(
  id: number,
  decryptedData: {
    name?: string;
    surname?: string;
    birthdate?: string;
    email?: string;
    gender?: string;
  }
): { maskedText: string; mappings: MaskMapping[] } {
  const mappings: MaskMapping[] = [];
  const parts: string[] = [];

  if (decryptedData.name) {
    const mask = createMask('MEMBER_NAME', id);
    mappings.push({ mask, originalValue: decryptedData.name });
    parts.push(`Name: ${mask}`);
  }
  if (decryptedData.surname) {
    const mask = createMask('MEMBER_SURNAME', id);
    mappings.push({ mask, originalValue: decryptedData.surname });
    parts.push(`Surname: ${mask}`);
  }
  if (decryptedData.birthdate) {
    const mask = createMask('MEMBER_BIRTHDATE', id);
    mappings.push({ mask, originalValue: decryptedData.birthdate });
    parts.push(`Birthdate: ${mask}`);
  }
  if (decryptedData.email) {
    const mask = createMask('MEMBER_EMAIL', id);
    mappings.push({ mask, originalValue: decryptedData.email });
    parts.push(`Email: ${mask}`);
  }
  if (decryptedData.gender) {
    const mask = createMask('MEMBER_GENDER', id);
    mappings.push({ mask, originalValue: decryptedData.gender });
    parts.push(`Gender: ${mask}`);
  }

  return {
    maskedText: parts.join('\n'),
    mappings
  };
}

// Weight measurement for masking
export interface WeightMeasurement {
  id: number;
  memberId: number;
  memberName: string; // decrypted full name
  memberGender?: string; // decrypted gender (M/F)
  weight: number;
  date: string;
}

// Create masked data for weight measurements (grouped by member)
export function maskWeightMeasurements(
  measurements: WeightMeasurement[]
): { maskedText: string; mappings: MaskMapping[] } {
  const mappings: MaskMapping[] = [];

  // Group measurements by member
  const byMember = new Map<number, { memberName: string; memberGender?: string; measurements: { date: string; weight: number }[] }>();

  for (const m of measurements) {
    if (!byMember.has(m.memberId)) {
      byMember.set(m.memberId, { memberName: m.memberName, memberGender: m.memberGender, measurements: [] });
    }
    byMember.get(m.memberId)!.measurements.push({ date: m.date, weight: m.weight });
  }

  const lines: string[] = [];

  for (const [memberId, data] of byMember) {
    // Create mask for member name
    const memberMask = createMask('MEMBER', memberId);
    mappings.push({ mask: memberMask, originalValue: data.memberName });

    // Create mask for gender if available
    let genderPart = '';
    if (data.memberGender) {
      const genderMask = createMask('MEMBER_GENDER', memberId);
      mappings.push({ mask: genderMask, originalValue: data.memberGender });
      genderPart = ` (gender: ${genderMask})`;
    }

    // Sort measurements by date
    data.measurements.sort((a, b) => a.date.localeCompare(b.date));

    // Format measurements
    const measurementStr = data.measurements
      .map(m => `${m.date}: ${m.weight}kg`)
      .join(', ');

    lines.push(`Measurements from ${memberMask}${genderPart}: ${measurementStr}`);
  }

  return {
    maskedText: lines.join('\n'),
    mappings
  };
}

// Create masked data for a single weight record (backward compatibility)
export function maskWeightRecord(
  id: number,
  memberId: number,
  memberName: string,
  weight: number,
  date: string
): { maskedText: string; mappings: MaskMapping[] } {
  return maskWeightMeasurements([{ id, memberId, memberName, weight, date }]);
}

// Unmask a response by replacing masks with original values
export function unmaskResponse(response: string, mappings: MaskMapping[]): string {
  let unmasked = response;
  for (const { mask, originalValue } of mappings) {
    // Escape special regex characters in mask
    const escapedMask = mask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    unmasked = unmasked.replace(new RegExp(escapedMask, 'g'), originalValue);
  }
  return unmasked;
}

// System prompt for LLM that explains the masking
export const LLM_SYSTEM_PROMPT = `You are a helpful assistant analyzing health and weight tracking data.
The data you receive contains masked personally identifiable information (PII) for privacy protection.

Masked fields appear as placeholders like:
- {{ MEMBER_X7K9M2 }} - represents a person's full name
- {{ MEMBER_NAME_A3B5C7 }} - represents a person's first name
- {{ MEMBER_SURNAME_D8E2F1 }} - represents a person's surname
- {{ MEMBER_BIRTHDATE_G4H6J8 }} - represents a person's birthdate
- {{ MEMBER_EMAIL_K1L3M5 }} - represents a person's email address
- {{ MEMBER_GENDER_P2Q4R6 }} - represents a person's gender (M or F)

The alphanumeric codes are randomly generated and have no relation to the actual data.

When responding:
1. Refer to the masked values using their exact placeholders (e.g., "{{ MEMBER_X7K9M2 }} has gained weight...")
2. Do not try to guess or infer the actual values behind the masks
3. Treat each unique placeholder as a distinct person
4. You can analyze weight trends, calculate changes, and provide health insights

The masks will be replaced with actual values before showing the response to the user.`;
