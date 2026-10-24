// ============================================================
// CivicSense – Auto-Classification Engine
// ============================================================
// Classifies a complaint into one of the predefined categories
// based on keyword matching in the title and description.
//
// Algorithm:
//   1. Tokenise the input text (title + description).
//   2. For each category, count keyword hits from its keyword list.
//   3. Pick the category with the highest hit count.
//   4. If no category scores any hits, return 'Other'.
//
// This is a simple rule-based classifier suitable for a demo.
// In production, this could be replaced with:
//   - A fine-tuned text classifier (BERT / fastText)
//   - A zero-shot LLM prompt
//   - A regex + ML ensemble
// ============================================================

import type { ComplaintCategory } from '../types';

// ──────────────────────────────────────────────────────────
// Keyword lexicon per category
// Each keyword is a lowercase substring that must appear in
// the normalised text. Multi-word phrases are matched as-is.
// ──────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<ComplaintCategory, string[]> = {
  'Waste & Garbage': [
    'garbage', 'waste', 'rubbish', 'trash', 'litter', 'dumping',
    'bin', 'dustbin', 'overflowing', 'stench', 'decompose',
    'carcass', 'dead animal', 'sanitation', 'filth', 'sweep',
    'collection', 'solid waste',
  ],
  'Roads & Potholes': [
    'pothole', 'road', 'footpath', 'pavement', 'crack', 'cave-in',
    'lane', 'asphalt', 'tar', 'speed bump', 'speed breaker',
    'divider', 'median', 'traffic', 'gravel', 'debris', 'rubble',
    'construction debris', 'broken road', 'damaged road',
  ],
  'Streetlights': [
    'streetlight', 'street light', 'lamp post', 'lamp', 'light',
    'dark', 'electrical', 'power', 'bulb', 'fixture', 'wiring',
    'wire', 'electrocution', 'transformer', 'feeder', 'illumination',
  ],
  'Water Supply': [
    'water', 'supply', 'pipeline', 'pipe', 'bwssb', 'tap',
    'leakage', 'burst', 'main', 'pressure', 'discoloured',
    'muddy water', 'contamination', 'tanker', 'meter',
  ],
  'Drainage': [
    'drain', 'drainage', 'sewer', 'sewage', 'manhole',
    'storm drain', 'rainwater', 'clogged', 'blocked drain',
    'overflow', 'flood', 'waterlogging', 'smell', 'foul smell',
    'open drain',
  ],
  'Parks & Recreation': [
    'park', 'garden', 'playground', 'tree', 'bench', 'greenery',
    'footpath in park', 'lalbagh', 'cubbon', 'encroachment',
    'vandalism', 'graffiti', 'stray dog', 'dog bite', 'jogger',
    'recreation', 'arborist', 'trimming',
  ],
  'Noise Pollution': [
    'noise', 'sound', 'loud', 'decibel', 'disturbance',
    'construction noise', 'midnight', 'blaring', 'horn',
    'loudspeaker', 'vibration',
  ],
  Other: [],  // catch-all – never given keywords (scores 0 by default)
};

// ──────────────────────────────────────────────────────────
// Classifier function
// ──────────────────────────────────────────────────────────

/**
 * Suggest a category for a new complaint based on keywords.
 * Returns the best-matching category and a confidence (0–1)
 * representing the fraction of matched vs. total tokens.
 */
export function classifyComplaint(
  title: string,
  description: string,
): { category: ComplaintCategory; confidence: number } {
  const combined = `${title} ${description}`.toLowerCase();

  let bestCategory: ComplaintCategory = 'Other';
  let bestScore = 0;
  let totalKeywords = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    ComplaintCategory,
    string[],
  ][]) {
    if (keywords.length === 0) continue;
    totalKeywords = Math.max(totalKeywords, keywords.length);

    const hits = keywords.filter((kw) => combined.includes(kw)).length;
    if (hits > bestScore) {
      bestScore = hits;
      bestCategory = category;
    }
  }

  // Confidence = fraction of the winning category's keywords matched,
  // capped at 1.0.
  const winnerKeywords =
    CATEGORY_KEYWORDS[bestCategory]?.length || 1;
  const confidence = bestScore > 0 ? Math.min(bestScore / winnerKeywords, 1) : 0;

  return { category: bestCategory, confidence };
}

export const classifyText = classifyComplaint;

// ──────────────────────────────────────────────────────────
// Department auto-routing by category
// ──────────────────────────────────────────────────────────
import type { Department } from '../types';

export const CATEGORY_TO_DEPARTMENT: Partial<Record<ComplaintCategory, Department>> = {
  'Waste & Garbage': 'Sanitation',
  'Roads & Potholes': 'Roads & Infrastructure',
  Streetlights: 'Electrical / Streetlights',
  'Water Supply': 'Water & Drainage',
  Drainage: 'Water & Drainage',
  'Parks & Recreation': 'Parks',
};

/**
 * Returns the default department for a given category.
 * Returns undefined for 'Noise Pollution' and 'Other' since they
 * require manual assignment.
 */
export function autoRouteDepartment(
  category: ComplaintCategory,
): Department | undefined {
  return CATEGORY_TO_DEPARTMENT[category];
}
