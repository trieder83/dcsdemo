// PII Protection utility using Named Entity Recognition
// Detects and replaces PII in user questions before sending to LLM

import nlp from 'compromise';
import { MaskMapping } from './masking';

// Detected PII entity
export interface DetectedPII {
  text: string;
  type: 'name' | 'email' | 'date';
  start: number;
  end: number;
  matchedMask?: string;
  matchedOriginal?: string;
}

// Result of PII analysis
export interface PIIAnalysisResult {
  sanitizedText: string;
  detectedPII: DetectedPII[];
  unmatchedPII: DetectedPII[];
  hasUnmatchedPII: boolean;
  replacements: { original: string; mask: string }[];
}

// Email regex pattern
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Date patterns (various formats)
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/g,                    // 2024-01-15
  /\b\d{2}\/\d{2}\/\d{4}\b/g,                  // 01/15/2024
  /\b\d{2}\.\d{2}\.\d{4}\b/g,                  // 15.01.2024
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi,  // 15 January 2024
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi, // January 15, 2024
];

// Normalize text for comparison (lowercase, trim, remove extra spaces)
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Check if two strings are similar (fuzzy match)
function isSimilar(a: string, b: string): boolean {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  // Exact match
  if (normA === normB) return true;

  // One contains the other
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Check if names match (first name, last name, or full name)
  const partsA = normA.split(' ');
  const partsB = normB.split(' ');

  for (const partA of partsA) {
    for (const partB of partsB) {
      if (partA.length > 2 && partB.length > 2 && partA === partB) {
        return true;
      }
    }
  }

  return false;
}

// Convert text to title case for NLP processing
function toTitleCase(text: string): string {
  return text.replace(/\b\w+/g, word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

// Detect names using compromise NLP (case-insensitive)
function detectNames(text: string, mappings: MaskMapping[] = []): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  const textLower = text.toLowerCase();

  // 1. Try compromise on original text
  const doc = nlp(text);
  const people = doc.people().out('array') as string[];

  for (const person of people) {
    let searchStart = 0;
    let index: number;

    while ((index = textLower.indexOf(person.toLowerCase(), searchStart)) !== -1) {
      results.push({
        text: text.substring(index, index + person.length),
        start: index,
        end: index + person.length
      });
      searchStart = index + 1;
    }
  }

  // 2. Try compromise on title-cased text (catches lowercase names)
  const titleCased = toTitleCase(text);
  const docTitle = nlp(titleCased);
  const peopleTitle = docTitle.people().out('array') as string[];

  for (const person of peopleTitle) {
    let searchStart = 0;
    let index: number;
    const personLower = person.toLowerCase();

    while ((index = textLower.indexOf(personLower, searchStart)) !== -1) {
      const exists = results.some(r =>
        (index >= r.start && index < r.end) ||
        (r.start >= index && r.start < index + person.length)
      );
      if (!exists) {
        results.push({
          text: text.substring(index, index + person.length),
          start: index,
          end: index + person.length
        });
      }
      searchStart = index + 1;
    }
  }

  // 3. Direct search for known names from mappings (case-insensitive)
  for (const { originalValue } of mappings) {
    const valueLower = originalValue.toLowerCase();
    let searchStart = 0;
    let index: number;

    // Search for full name
    while ((index = textLower.indexOf(valueLower, searchStart)) !== -1) {
      // Check word boundaries
      const before = index === 0 || /\s/.test(text[index - 1]);
      const after = index + originalValue.length >= text.length || /\s/.test(text[index + originalValue.length]);

      if (before && after) {
        const exists = results.some(r =>
          (index >= r.start && index < r.end) ||
          (r.start >= index && r.start < index + originalValue.length)
        );
        if (!exists) {
          results.push({
            text: text.substring(index, index + originalValue.length),
            start: index,
            end: index + originalValue.length
          });
        }
      }
      searchStart = index + 1;
    }

    // Search for individual name parts (first name, last name)
    const parts = originalValue.trim().split(/\s+/);
    for (const part of parts) {
      if (part.length < 3) continue; // Skip short parts
      const partLower = part.toLowerCase();
      searchStart = 0;

      while ((index = textLower.indexOf(partLower, searchStart)) !== -1) {
        // Check word boundaries
        const before = index === 0 || /\s/.test(text[index - 1]);
        const after = index + part.length >= text.length || /\s/.test(text[index + part.length]);

        if (before && after) {
          const exists = results.some(r =>
            (index >= r.start && index < r.end) ||
            (r.start >= index && r.start < index + part.length)
          );
          if (!exists) {
            results.push({
              text: text.substring(index, index + part.length),
              start: index,
              end: index + part.length
            });
          }
        }
        searchStart = index + 1;
      }
    }
  }

  // 4. Also detect capitalized words that look like names (fallback)
  const capitalizedPattern = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g;
  let match;
  while ((match = capitalizedPattern.exec(text)) !== null) {
    // Skip common words that might be capitalized
    const skipWords = ['the', 'did', 'does', 'has', 'have', 'was', 'were', 'will', 'would',
                       'could', 'should', 'may', 'might', 'must', 'can', 'weight', 'lose',
                       'gain', 'member', 'data', 'january', 'february', 'march', 'april',
                       'may', 'june', 'july', 'august', 'september', 'october', 'november',
                       'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
                       'saturday', 'sunday'];

    if (!skipWords.includes(match[0].toLowerCase())) {
      const exists = results.some(r => r.start === match!.index && r.end === match!.index + match![0].length);
      if (!exists) {
        results.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
  }

  return results;
}

// Detect emails in text
function detectEmails(text: string): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  let match;

  const regex = new RegExp(EMAIL_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    results.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return results;
}

// Detect dates in text
function detectDates(text: string): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];

  for (const pattern of DATE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const exists = results.some(r =>
        (match!.index >= r.start && match!.index < r.end) ||
        (r.start >= match!.index && r.start < match!.index + match![0].length)
      );
      if (!exists) {
        results.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
  }

  return results;
}

// Build a lookup map from mappings for quick matching
function buildLookupMap(mappings: MaskMapping[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const { mask, originalValue } of mappings) {
    // Store normalized original value -> mask
    lookup.set(normalizeText(originalValue), mask);

    // Also store individual name parts
    const parts = originalValue.trim().split(/\s+/);
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length > 2) {
          // Only add part if it doesn't already map to something else
          const normPart = normalizeText(part);
          if (!lookup.has(normPart)) {
            lookup.set(normPart, mask);
          }
        }
      }
    }
  }

  return lookup;
}

// Find matching mask for detected PII
function findMatchingMask(
  detected: { text: string; type: 'name' | 'email' | 'date' },
  mappings: MaskMapping[]
): { mask: string; original: string } | null {
  const normalizedDetected = normalizeText(detected.text);

  for (const { mask, originalValue } of mappings) {
    if (isSimilar(detected.text, originalValue)) {
      return { mask, original: originalValue };
    }
  }

  return null;
}

// Main function: Analyze text for PII and suggest replacements
export function analyzePII(
  text: string,
  mappings: MaskMapping[]
): PIIAnalysisResult {
  const detectedPII: DetectedPII[] = [];
  const unmatchedPII: DetectedPII[] = [];
  const replacements: { original: string; mask: string }[] = [];

  // Detect all PII types (pass mappings for case-insensitive known name detection)
  const names = detectNames(text, mappings);
  const emails = detectEmails(text);
  const dates = detectDates(text);

  // Process names
  for (const name of names) {
    const match = findMatchingMask({ text: name.text, type: 'name' }, mappings);
    const pii: DetectedPII = {
      text: name.text,
      type: 'name',
      start: name.start,
      end: name.end,
      matchedMask: match?.mask,
      matchedOriginal: match?.original
    };

    detectedPII.push(pii);
    if (!match) {
      unmatchedPII.push(pii);
    }
  }

  // Process emails
  for (const email of emails) {
    const match = findMatchingMask({ text: email.text, type: 'email' }, mappings);
    const pii: DetectedPII = {
      text: email.text,
      type: 'email',
      start: email.start,
      end: email.end,
      matchedMask: match?.mask,
      matchedOriginal: match?.original
    };

    detectedPII.push(pii);
    if (!match) {
      unmatchedPII.push(pii);
    }
  }

  // Process dates (only flag if they look like birthdates in context)
  for (const date of dates) {
    const match = findMatchingMask({ text: date.text, type: 'date' }, mappings);
    // Only flag dates that match known birthdates
    if (match) {
      const pii: DetectedPII = {
        text: date.text,
        type: 'date',
        start: date.start,
        end: date.end,
        matchedMask: match.mask,
        matchedOriginal: match.original
      };
      detectedPII.push(pii);
    }
  }

  // Sort by position (descending) for replacement
  const sortedPII = [...detectedPII].filter(p => p.matchedMask).sort((a, b) => b.start - a.start);

  // Build sanitized text by replacing matched PII
  let sanitizedText = text;
  for (const pii of sortedPII) {
    if (pii.matchedMask) {
      sanitizedText = sanitizedText.substring(0, pii.start) + pii.matchedMask + sanitizedText.substring(pii.end);
      replacements.push({ original: pii.text, mask: pii.matchedMask });
    }
  }

  return {
    sanitizedText,
    detectedPII,
    unmatchedPII,
    hasUnmatchedPII: unmatchedPII.length > 0,
    replacements: replacements.reverse() // Return in original order
  };
}

// Get suggestions for available masks
export function getMaskSuggestions(mappings: MaskMapping[]): Array<{ mask: string; hint: string }> {
  const suggestions: Array<{ mask: string; hint: string }> = [];

  for (const { mask, originalValue } of mappings) {
    // Create a hint that shows partial info
    let hint = '';
    if (mask.includes('MEMBER_NAME') || mask.includes('MEMBER_SURNAME') || mask.includes('MEMBER_')) {
      // Show first letter and length
      hint = `${originalValue[0]}${'*'.repeat(Math.max(0, originalValue.length - 1))} (${originalValue.length} chars)`;
    } else if (mask.includes('EMAIL')) {
      // Show domain only
      const atIndex = originalValue.indexOf('@');
      if (atIndex > 0) {
        hint = `***@${originalValue.substring(atIndex + 1)}`;
      }
    } else if (mask.includes('BIRTHDATE')) {
      // Show year only
      const yearMatch = originalValue.match(/\d{4}/);
      if (yearMatch) {
        hint = `Year: ${yearMatch[0]}`;
      }
    }

    suggestions.push({ mask, hint });
  }

  return suggestions;
}

// Check if question is safe to send (no unmatched PII)
export function isQuestionSafe(text: string, mappings: MaskMapping[]): { safe: boolean; issues: string[] } {
  const analysis = analyzePII(text, mappings);
  const issues: string[] = [];

  for (const pii of analysis.unmatchedPII) {
    issues.push(`Detected ${pii.type} "${pii.text}" that doesn't match any known data. Please use a mask placeholder instead.`);
  }

  return {
    safe: issues.length === 0,
    issues
  };
}
