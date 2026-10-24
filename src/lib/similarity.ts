// ============================================================
// CivicSense – Similarity Engine
// ============================================================
// Implements complaint deduplication using a hybrid approach:
//   1. Jaccard token similarity on title + description text
//   2. Geographic proximity (Haversine distance)
//   3. Category match bonus
//
// The final score is a weighted combination:
//   score = 0.5 * textSim + 0.3 * locationSim + 0.2 * categorySim
//
// Thresholds:
//   ≥ 0.75  → "Strong duplicate" (automatically flagged)
//   0.50–0.75 → "Possible duplicate" (shown for admin review)
//   < 0.50  → Not a duplicate candidate
// ============================================================

import type { Complaint, DuplicateMatch } from '../types';

// ──────────────────────────────────────────────────────────
// 1. Text similarity: Jaccard on word tokens
// ──────────────────────────────────────────────────────────

/**
 * Tokenise a string into a Set of lowercase, de-punctuated words,
 * filtering out very common stopwords so they don't inflate similarity.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'in', 'on', 'at', 'of', 'to', 'for',
  'with', 'and', 'or', 'but', 'has', 'have', 'been', 'was', 'are',
  'by', 'from', 'that', 'this', 'it', 'its', 'as', 'be', 'not',
  'near', 'there', 'which',
]);

function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 * Returns a value in [0, 1].
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

// ──────────────────────────────────────────────────────────
// 2. Geographic proximity
// ──────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine formula – returns great-circle distance in km.
 */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Convert a distance to a [0, 1] similarity score.
 * Distance of 0 m → 1.0; distance ≥ 1 km → 0.0 (linear decay).
 * The 1 km threshold is chosen because civic issues reported within
 * 1 km of each other are likely to be about the same physical problem.
 */
const MAX_DISTANCE_KM = 1.0;

function locationSimilarity(
  lat1: number | null | undefined, lng1: number | null | undefined,
  lat2: number | null | undefined, lng2: number | null | undefined,
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const dist = haversineKm(lat1, lng1, lat2, lng2);
  return Math.max(0, 1 - dist / MAX_DISTANCE_KM);
}

// ──────────────────────────────────────────────────────────
// 3. Combined scoring
// ──────────────────────────────────────────────────────────

const WEIGHT_TEXT = 0.5;
const WEIGHT_LOCATION = 0.3;
const WEIGHT_CATEGORY = 0.2;

/** Minimum combined score to surface as a "possible duplicate". */
export const DUPLICATE_THRESHOLD = 0.50;
/** Score at or above this is considered a strong / auto-flagged duplicate. */
export const STRONG_DUPLICATE_THRESHOLD = 0.75;

export interface SimilarityBreakdown {
  textScore: number;
  locationScore: number;
  categoryScore: number;
  combined: number;
}

/**
 * Compute the full similarity breakdown between two complaints.
 */
export function computeSimilarity(
  a: Complaint,
  b: Complaint,
): SimilarityBreakdown {
  // Text similarity on title + description combined
  const tokensA = tokenise(`${a.title} ${a.description}`);
  const tokensB = tokenise(`${b.title} ${b.description}`);
  const textScore = jaccardSimilarity(tokensA, tokensB);

  // Location similarity
  const locScore = locationSimilarity(
    a.location.lat, a.location.lng,
    b.location.lat, b.location.lng,
  );

  // Category: binary match gives full 1.0
  const catScore = a.category === b.category ? 1.0 : 0.0;

  const combined =
    WEIGHT_TEXT * textScore +
    WEIGHT_LOCATION * locScore +
    WEIGHT_CATEGORY * catScore;

  return {
    textScore,
    locationScore: locScore,
    categoryScore: catScore,
    combined,
  };
}

/**
 * Find all likely duplicates for a given complaint from a list.
 * Skips itself, already-confirmed duplicates, and closed/rejected items.
 * Returns matches sorted by score descending, above the threshold.
 */
export function findDuplicates(
  complaint: Complaint,
  allComplaints: Complaint[],
): DuplicateMatch[] {
  const candidates = allComplaints.filter(
    (c) =>
      c.id !== complaint.id &&
      c.status !== 'Closed' &&
      c.status !== 'Rejected' &&
      !c.duplicateOf, // don't suggest a confirmed duplicate as a match
  );

  const matches: DuplicateMatch[] = [];

  for (const candidate of candidates) {
    const breakdown = computeSimilarity(complaint, candidate);

    if (breakdown.combined >= DUPLICATE_THRESHOLD) {
      const reasons: string[] = [];

      if (breakdown.textScore >= 0.4) {
        reasons.push(`Text similarity ${Math.round(breakdown.textScore * 100)}%`);
      }
      if (
        breakdown.locationScore >= 0.5 &&
        complaint.location.lat != null && complaint.location.lng != null &&
        candidate.location.lat != null && candidate.location.lng != null
      ) {
        const distM = Math.round(
          haversineKm(
            complaint.location.lat, complaint.location.lng,
            candidate.location.lat, candidate.location.lng,
          ) * 1000,
        );
        reasons.push(`Location ${distM}m apart`);
      }
      if (breakdown.categoryScore === 1) {
        reasons.push(`Same category (${complaint.category})`);
      }

      matches.push({
        complaintId: candidate.id,
        score: Math.round(breakdown.combined * 100) / 100,
        reasons,
      });
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}
