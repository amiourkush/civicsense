// ============================================================
// CivicSense – Location Analytics & Geographic Grouping Engine
// ============================================================
// Provides geographic clustering of complaints based on coordinate
// proximity, allowing administrators to identify hotspot locations,
// distinguish multiple reports at the same location from isolated
// incidents, and inspect departmental workload.
//
// NOTE: Multiple reports at the same location are categorized as
// "shared-location reports" or "multiple reports". They are NOT
// automatically flagged as confirmed duplicates unless verified by
// the duplicate detection system (similarity.ts).
// ============================================================

import type { Complaint, ComplaintCategory, ComplaintStatus, Department } from '../types';
import { autoRouteDepartment } from './classifier';

/**
 * Configurable geographic proximity threshold (in metres).
 * Complaints within this radius are grouped into the same location cluster.
 */
export const LOCATION_CLUSTER_THRESHOLD_METERS = 100;

const EARTH_RADIUS_KM = 6371;

/**
 * Calculates Great-Circle distance between two points using the Haversine formula.
 * Returns distance in metres.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c * 1000;
}

export interface LocationCluster {
  id: string;
  address: string;
  lat: number;
  lng: number;
  complaintIds: string[];
  complaints: Complaint[];
  statusBreakdown: Record<string, number>;
  departmentBreakdown: Record<string, number>;
  isMultiReport: boolean;
}

export interface DepartmentMetric {
  department: Department | 'Unassigned';
  assignedCount: number;
  recommendedCount: number;
}

export interface CategoryLocationAnalytics {
  category: ComplaintCategory | 'All';
  totalComplaints: number;
  locatedComplaintsCount: number;
  unlocatedComplaintsCount: number;
  totalClusters: number;
  multiReportClustersCount: number;
  singleReportClustersCount: number;
  recordsInMultiReportClusters: number;
  recordsInSingleReportClusters: number;
  distinctDepartmentsCount: number;
  departmentBreakdown: DepartmentMetric[];
  clusters: LocationCluster[];
  unlocatedComplaints: Complaint[];
}

export const ALL_DEPARTMENTS: Department[] = [
  'Sanitation',
  'Roads & Infrastructure',
  'Electrical / Streetlights',
  'Water & Drainage',
  'Parks',
];

/**
 * Analyze complaints for a specific category (or across all complaints)
 * by grouping them into geographic clusters within the configured threshold.
 */
export function analyzeCategoryLocations(
  complaints: Complaint[],
  categoryFilter?: ComplaintCategory | 'All',
  thresholdMeters: number = LOCATION_CLUSTER_THRESHOLD_METERS,
): CategoryLocationAnalytics {
  const targetCategory = categoryFilter || 'All';

  // 1. Filter complaints by category if requested
  const filtered =
    targetCategory === 'All'
      ? complaints
      : complaints.filter((c) => c.category === targetCategory);

  const totalComplaints = filtered.length;

  // 2. Separate complaints with valid coordinates from unlocated records
  const located: Complaint[] = [];
  const unlocated: Complaint[] = [];

  for (const c of filtered) {
    if (
      c.location &&
      typeof c.location.lat === 'number' &&
      typeof c.location.lng === 'number' &&
      !isNaN(c.location.lat) &&
      !isNaN(c.location.lng)
    ) {
      located.push(c);
    } else {
      unlocated.push(c);
    }
  }

  // 3. Greedy geographic clustering
  // For each complaint, find the closest existing cluster center within thresholdMeters.
  // If found, append to that cluster; otherwise, seed a new cluster.
  const clusters: LocationCluster[] = [];

  for (const complaint of located) {
    const lat = complaint.location.lat!;
    const lng = complaint.location.lng!;

    let matchedCluster: LocationCluster | null = null;
    let shortestDist = Infinity;

    for (const cluster of clusters) {
      const dist = haversineDistanceMeters(cluster.lat, cluster.lng, lat, lng);
      if (dist <= thresholdMeters && dist < shortestDist) {
        shortestDist = dist;
        matchedCluster = cluster;
      }
    }

    if (matchedCluster) {
      matchedCluster.complaintIds.push(complaint.id);
      matchedCluster.complaints.push(complaint);
    } else {
      clusters.push({
        id: `loc-cluster-${clusters.length + 1}`,
        address: complaint.location.address || `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`,
        lat,
        lng,
        complaintIds: [complaint.id],
        complaints: [complaint],
        statusBreakdown: {},
        departmentBreakdown: {},
        isMultiReport: false,
      });
    }
  }

  // 4. Calculate cluster-level breakdowns & flags
  for (const cluster of clusters) {
    cluster.isMultiReport = cluster.complaints.length >= 2;

    const statusCounts: Record<string, number> = {};
    const deptCounts: Record<string, number> = {};

    for (const c of cluster.complaints) {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      const deptKey = c.assignedDepartment || 'Unassigned';
      deptCounts[deptKey] = (deptCounts[deptKey] || 0) + 1;
    }

    cluster.statusBreakdown = statusCounts;
    cluster.departmentBreakdown = deptCounts;
  }

  // Sort clusters: multi-report first, then descending by complaints count
  clusters.sort((a, b) => b.complaints.length - a.complaints.length);

  // 5. Aggregate summary metrics
  const multiReportClusters = clusters.filter((c) => c.isMultiReport);
  const singleReportClusters = clusters.filter((c) => !c.isMultiReport);

  const recordsInMultiReportClusters = multiReportClusters.reduce(
    (sum, c) => sum + c.complaints.length,
    0,
  );
  const recordsInSingleReportClusters = singleReportClusters.reduce(
    (sum, c) => sum + c.complaints.length,
    0,
  );

  // 6. Department breakdown (assigned vs. recommended)
  // Ensure ALL departments appear, even if 0 complaints, plus Unassigned
  const deptMap: Record<string, { assigned: number; recommended: number }> = {};
  for (const dept of ALL_DEPARTMENTS) {
    deptMap[dept] = { assigned: 0, recommended: 0 };
  }
  deptMap['Unassigned'] = { assigned: 0, recommended: 0 };

  for (const c of filtered) {
    const assigned = c.assignedDepartment || 'Unassigned';
    if (deptMap[assigned]) {
      deptMap[assigned].assigned += 1;
    }

    const recommended = autoRouteDepartment(c.category) || 'Unassigned';
    if (deptMap[recommended]) {
      deptMap[recommended].recommended += 1;
    }
  }

  const departmentBreakdown: DepartmentMetric[] = [
    ...ALL_DEPARTMENTS.map((dept) => ({
      department: dept,
      assignedCount: deptMap[dept].assigned,
      recommendedCount: deptMap[dept].recommended,
    })),
    {
      department: 'Unassigned',
      assignedCount: deptMap['Unassigned'].assigned,
      recommendedCount: deptMap['Unassigned'].recommended,
    },
  ];

  // Distinct departments involved (handling or recommended, excluding pure 0s)
  const distinctDepartmentsCount = departmentBreakdown.filter(
    (d) => d.department !== 'Unassigned' && (d.assignedCount > 0 || d.recommendedCount > 0),
  ).length;

  return {
    category: targetCategory,
    totalComplaints,
    locatedComplaintsCount: located.length,
    unlocatedComplaintsCount: unlocated.length,
    totalClusters: clusters.length,
    multiReportClustersCount: multiReportClusters.length,
    singleReportClustersCount: singleReportClusters.length,
    recordsInMultiReportClusters,
    recordsInSingleReportClusters,
    distinctDepartmentsCount,
    departmentBreakdown,
    clusters,
    unlocatedComplaints: unlocated,
  };
}
