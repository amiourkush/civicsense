import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  APIProvider,
  Map,
  Marker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  MapPin, Filter, RotateCcw, AlertTriangle, Layers, Building2,
  ExternalLink, Info, CheckCircle2, AlertCircle, ShieldAlert, Sparkles
} from 'lucide-react';
import type { Complaint, ComplaintCategory, ComplaintStatus, Department } from '../../types';
import { CATEGORY_COLORS, STATUS_COLORS } from '../../lib/utils';
import { StatusBadge, PriorityBadge, CategoryBadge } from '../ui/Badge';
import { Button } from '../ui';
import { analyzeCategoryLocations, LocationCluster } from '../../lib/locationAnalytics';

const BENGALURU_CENTER = { lat: 12.9716, lng: 77.5946 };

// Helper to generate SVG marker with count badge and category color
function getMarkerIcon(category: string, count: number): google.maps.Icon | undefined {
  if (typeof google === 'undefined' || !google.maps) return undefined;

  const color = CATEGORY_COLORS[category as ComplaintCategory] || '#2563eb';
  const isMulti = count > 1;
  const size = isMulti ? 38 : 30;
  const text = isMulti ? count.toString() : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 10}" viewBox="0 0 ${size} ${size + 10}">
    <defs>
      <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>
    <path d="M${size / 2} ${size + 8} L${size / 2 - 6} ${size * 0.72} A${size / 2 - 2} ${size / 2 - 2} 0 1 1 ${size / 2 + 6} ${size * 0.72} Z" fill="${color}" stroke="#ffffff" stroke-width="2.5" filter="url(#sh)"/>
    ${
      isMulti
        ? `<circle cx="${size / 2}" cy="${size * 0.42}" r="${size * 0.32}" fill="#ffffff"/>
           <text x="${size / 2}" y="${size * 0.42 + 4}" font-family="system-ui, sans-serif" font-size="${
            size >= 36 ? 12 : 10
          }" font-weight="bold" fill="${color}" text-anchor="middle">${text}</text>`
        : `<circle cx="${size / 2}" cy="${size * 0.42}" r="4" fill="#ffffff"/>`
    }
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size + 10),
    anchor: new google.maps.Point(size / 2, size + 10),
  };
}

// Controller component to automatically manage map viewport and camera focus
function MapViewportController({
  clusters,
  focusCoordinates,
}: {
  clusters: LocationCluster[];
  focusCoordinates: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (focusCoordinates) {
      map.panTo(focusCoordinates);
      map.setZoom(16);
      return;
    }

    if (clusters.length === 0) {
      map.panTo(BENGALURU_CENTER);
      map.setZoom(12);
      return;
    }

    if (typeof google !== 'undefined' && google.maps) {
      const bounds = new google.maps.LatLngBounds();
      clusters.forEach((c) => bounds.extend({ lat: c.lat, lng: c.lng }));
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });

      // Prevent over-zooming on single cluster
      google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom() && map.getZoom()! > 16) {
          map.setZoom(15);
        }
      });
    }
  }, [map, clusters, focusCoordinates]);

  return null;
}

interface ComplaintMapProps {
  complaints: Complaint[];
  selectedCategory?: ComplaintCategory | 'All';
  selectedDepartment?: Department | 'All';
  focusCoordinates?: { lat: number; lng: number } | null;
  onSelectCategory?: (category: ComplaintCategory | 'All') => void;
  onSelectDepartment?: (dept: Department | 'All') => void;
  onClearFocus?: () => void;
}

export function ComplaintMap({
  complaints,
  selectedCategory = 'All',
  selectedDepartment = 'All',
  focusCoordinates = null,
  onSelectCategory,
  onSelectDepartment,
  onClearFocus,
}: ComplaintMapProps) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const isKeyMissingOrPlaceholder = !apiKey || apiKey === 'your_google_maps_api_key_here';

  // Internal filter state
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | 'All'>(selectedCategory);
  const [departmentFilter, setDepartmentFilter] = useState<Department | 'All'>(selectedDepartment);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedCluster, setSelectedCluster] = useState<LocationCluster | null>(null);
  const [showUnlocatedModal, setShowUnlocatedModal] = useState(false);

  // Sync internal state when parent props change
  useEffect(() => {
    setCategoryFilter(selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    setDepartmentFilter(selectedDepartment);
  }, [selectedDepartment]);

  const handleCategoryChange = (val: ComplaintCategory | 'All') => {
    setCategoryFilter(val);
    if (onSelectCategory) onSelectCategory(val);
  };

  const handleDepartmentChange = (val: Department | 'All') => {
    setDepartmentFilter(val);
    if (onSelectDepartment) onSelectDepartment(val);
  };

  const handleResetFilters = () => {
    setCategoryFilter('All');
    setDepartmentFilter('All');
    setStatusFilter('All');
    setSelectedCluster(null);
    if (onSelectCategory) onSelectCategory('All');
    if (onSelectDepartment) onSelectDepartment('All');
    if (onClearFocus) onClearFocus();
  };

  // Filter complaints based on active filters
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
      if (departmentFilter !== 'All' && c.assignedDepartment !== departmentFilter) return false;
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      return true;
    });
  }, [complaints, categoryFilter, departmentFilter, statusFilter]);

  // Compute location clusters using the geographic clustering utility
  const locationAnalytics = useMemo(() => {
    return analyzeCategoryLocations(filteredComplaints, 'All');
  }, [filteredComplaints]);

  const { clusters, unlocatedComplaints } = locationAnalytics;

  // Auto-select cluster if focusCoordinates matches a cluster
  useEffect(() => {
    if (focusCoordinates) {
      const match = clusters.find(
        (c) =>
          Math.abs(c.lat - focusCoordinates.lat) < 0.0005 &&
          Math.abs(c.lng - focusCoordinates.lng) < 0.0005,
      );
      if (match) {
        setSelectedCluster(match);
      }
    }
  }, [focusCoordinates, clusters]);

  const hasActiveFilters =
    categoryFilter !== 'All' || departmentFilter !== 'All' || statusFilter !== 'All' || focusCoordinates !== null;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Map Control Bar & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value as any)}
              className="text-xs py-1 px-2 border border-slate-300 rounded-md bg-white text-slate-800 focus:ring-1 focus:ring-govblue-500 font-medium cursor-pointer"
            >
              <option value="All">All Categories ({complaints.length})</option>
              <option value="Waste & Garbage">Waste & Garbage</option>
              <option value="Roads & Potholes">Roads & Potholes</option>
              <option value="Streetlights">Streetlights</option>
              <option value="Water Supply">Water Supply</option>
              <option value="Drainage">Drainage</option>
              <option value="Parks & Recreation">Parks & Recreation</option>
              <option value="Noise Pollution">Noise Pollution</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => handleDepartmentChange(e.target.value as any)}
              className="text-xs py-1 px-2 border border-slate-300 rounded-md bg-white text-slate-800 focus:ring-1 focus:ring-govblue-500 font-medium cursor-pointer"
            >
              <option value="All">All Departments</option>
              <option value="Sanitation">Sanitation</option>
              <option value="Roads & Infrastructure">Roads & Infrastructure</option>
              <option value="Electrical / Streetlights">Electrical / Streetlights</option>
              <option value="Water & Drainage">Water & Drainage</option>
              <option value="Parks">Parks</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs py-1 px-2 border border-slate-300 rounded-md bg-white text-slate-800 focus:ring-1 focus:ring-govblue-500 font-medium cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="New">New</option>
              <option value="Acknowledged">Acknowledged</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
              <option value="Duplicate">Duplicate</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Missing coordinates badge */}
          {unlocatedComplaints.length > 0 && (
            <button
              onClick={() => setShowUnlocatedModal(true)}
              className="text-[11px] text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors"
              title="Click to view complaints awaiting GPS coordinates"
            >
              <AlertCircle size={12} className="text-amber-600" />
              <span>{unlocatedComplaints.length} unlocated</span>
            </button>
          )}

          {/* Reset button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs py-1 px-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md flex items-center gap-1 font-medium shadow-2xs transition-colors"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Map Container */}
      <div className="relative w-full h-[440px] sm:h-[480px] rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
        {isKeyMissingOrPlaceholder ? (
          /* Missing API Key Fallback Notice with Interactive Ward Visualizer */
          <div className="absolute inset-0 flex flex-col justify-between p-6 bg-gradient-to-b from-slate-50 via-blue-50/20 to-slate-100 text-slate-800 z-10 overflow-y-auto">
            <div className="max-w-xl mx-auto text-center space-y-3 pt-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-govblue-100 text-govblue-700 shadow-xs mb-1">
                <MapPin size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Interactive Google Maps Ready
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
                The map component is fully integrated using <code className="bg-slate-200 px-1 py-0.5 rounded text-govblue-800 font-mono text-[11px]">@vis.gl/react-google-maps</code>. To render the live Google satellite and street tiles, configure your Google Maps API key.
              </p>

              <div className="p-3 bg-white border border-slate-200 rounded-lg text-left shadow-2xs space-y-1.5 text-xs text-slate-600">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-govblue-600" /> Key Setup Instructions:
                </div>
                <div className="font-mono text-[11px] bg-slate-50 p-2 rounded border border-slate-200 select-all">
                  VITE_GOOGLE_MAPS_API_KEY=AIzaSy...your_key_here
                </div>
                <p className="text-[11px] text-slate-500">
                  Add this variable to your <code className="font-semibold text-slate-700">.env</code> file. Enable the <strong>Maps JavaScript API</strong> in Google Cloud Console.
                </p>
              </div>
            </div>

            {/* Interactive Location Clusters Simulation Grid when API Key is pending */}
            <div className="mt-4 pt-3 border-t border-slate-200/70">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Geographic Location Clusters ({clusters.length} Active Hotspots)
                </span>
                <span className="text-[11px] text-slate-500">
                  {filteredComplaints.length} complaints mapped
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {clusters.map((cluster) => {
                  const isMulti = cluster.isMultiReport;
                  const primaryCategory = cluster.complaints[0]?.category || 'Other';
                  const color = CATEGORY_COLORS[primaryCategory] || '#2563eb';

                  return (
                    <div
                      key={cluster.id}
                      onClick={() => setSelectedCluster(cluster)}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        selectedCluster?.id === cluster.id
                          ? 'border-govblue-500 bg-govblue-50 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                            isMulti
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {cluster.complaints.length} {cluster.complaints.length > 1 ? 'reports' : 'report'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 truncate" title={cluster.address}>
                        {cluster.address}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        {cluster.lat.toFixed(4)}, {cluster.lng.toFixed(4)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Live Google Map */
          <APIProvider apiKey={apiKey}>
            <Map
              defaultCenter={BENGALURU_CENTER}
              defaultZoom={12}
              gestureHandling="greedy"
              disableDefaultUI={false}
              className="w-full h-full"
            >
              <MapViewportController clusters={clusters} focusCoordinates={focusCoordinates} />

              {/* Render Markers for each cluster */}
              {clusters.map((cluster) => {
                const count = cluster.complaints.length;
                const primaryCategory = cluster.complaints[0]?.category || 'Other';
                const icon = getMarkerIcon(primaryCategory, count);

                return (
                  <Marker
                    key={cluster.id}
                    position={{ lat: cluster.lat, lng: cluster.lng }}
                    icon={icon}
                    title={`${cluster.address} (${count} complaints)`}
                    onClick={() => setSelectedCluster(cluster)}
                  />
                );
              })}

              {/* Info Window for Selected Cluster */}
              {selectedCluster && (
                <InfoWindow
                  position={{ lat: selectedCluster.lat, lng: selectedCluster.lng }}
                  onCloseClick={() => setSelectedCluster(null)}
                >
                  <div className="p-1 max-w-sm max-h-72 overflow-y-auto space-y-2">
                    <div className="border-b border-slate-200 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-rose-500 shrink-0" />
                        <h4 className="text-xs font-bold text-slate-900 leading-tight">
                          {selectedCluster.address}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-semibold text-govblue-700 bg-govblue-50 px-2 py-0.5 rounded border border-govblue-200">
                          {selectedCluster.complaints.length} {selectedCluster.complaints.length > 1 ? 'Complaints Reported Here' : 'Complaint'}
                        </span>
                        {selectedCluster.isMultiReport && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Shared Location Hotspot
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Complaint records at this location */}
                    <div className="space-y-1.5 divide-y divide-slate-100">
                      {selectedCluster.complaints.map((c) => (
                        <div key={c.id} className="pt-1.5 first:pt-0">
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              to={`/complaints/${c.id}`}
                              className="font-mono text-xs font-bold text-govblue-600 hover:underline flex items-center gap-1"
                            >
                              {c.id} <ExternalLink size={10} />
                            </Link>
                            <StatusBadge status={c.status} />
                          </div>
                          <div className="text-xs font-medium text-slate-800 line-clamp-1 mt-0.5">
                            {c.title}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <CategoryBadge category={c.category} />
                            <PriorityBadge priority={c.priority} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </APIProvider>
        )}
      </div>

      {/* Map Legend Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-white p-2.5 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
          <Layers size={13} className="text-govblue-600" /> Category Legend:
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(
            [
              ['Waste & Garbage', '#10b981'],
              ['Roads & Potholes', '#f59e0b'],
              ['Streetlights', '#fbbf24'],
              ['Water Supply', '#3b82f6'],
              ['Drainage', '#6366f1'],
              ['Parks', '#22c55e'],
            ] as const
          ).map(([cat, col]) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat as any)}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col }} />
              <span className="text-[11px] text-slate-700 font-medium">{cat}</span>
            </button>
          ))}

          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <span className="w-4 h-4 rounded-full bg-slate-800 text-white flex items-center justify-center text-[9px] font-bold">
              3
            </span>
            <span className="text-[11px] text-slate-700 font-medium">Shared Location Count</span>
          </div>
        </div>
      </div>

      {/* Modal: Unlocated Complaints */}
      {showUnlocatedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-amber-500" size={18} />
                <h3 className="text-base font-bold text-slate-900">
                  Complaints with Pending Coordinates ({unlocatedComplaints.length})
                </h3>
              </div>
              <button
                onClick={() => setShowUnlocatedModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              These complaints were registered without GPS coordinates or are currently awaiting field GIS verification. They are safely excluded from map markers but remain fully accessible for staff triage:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {unlocatedComplaints.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/complaints/${c.id}`}
                        className="font-mono text-xs font-bold text-govblue-600 hover:underline"
                      >
                        {c.id}
                      </Link>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                      {c.title}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {c.location.address || 'Address not specified'}
                    </div>
                  </div>

                  <Link to={`/complaints/${c.id}`}>
                    <Button size="sm" variant="outline" className="text-xs shrink-0">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button size="sm" variant="secondary" onClick={() => setShowUnlocatedModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
