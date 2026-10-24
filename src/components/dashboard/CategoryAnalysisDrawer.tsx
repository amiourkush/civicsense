import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X, MapPin, Building2, Layers, AlertTriangle, ArrowRight,
  ExternalLink, CheckCircle2, ChevronRight, Eye, ShieldAlert, Sparkles
} from 'lucide-react';
import type { Complaint, ComplaintCategory, Department } from '../../types';
import { StatusBadge, PriorityBadge, CategoryBadge } from '../ui/Badge';
import { Button, Card, CardHeader, CardBody } from '../ui';
import { CATEGORY_COLORS } from '../../lib/utils';
import {
  analyzeCategoryLocations,
  LocationCluster,
  CategoryLocationAnalytics
} from '../../lib/locationAnalytics';

interface CategoryAnalysisDrawerProps {
  category: ComplaintCategory;
  complaints: Complaint[];
  isOpen: boolean;
  onClose: () => void;
  onSelectLocationCluster: (cluster: LocationCluster) => void;
  selectedClusterId?: string | null;
}

export function CategoryAnalysisDrawer({
  category,
  complaints,
  isOpen,
  onClose,
  onSelectLocationCluster,
  selectedClusterId,
}: CategoryAnalysisDrawerProps) {
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<'locations' | 'departments' | 'records'>('locations');
  const [selectedLocationDetail, setSelectedLocationDetail] = useState<LocationCluster | null>(null);

  // Compute analytics dynamically
  const analytics: CategoryLocationAnalytics = React.useMemo(() => {
    return analyzeCategoryLocations(complaints, category);
  }, [complaints, category]);

  if (!isOpen) return null;

  const categoryColor = CATEGORY_COLORS[category] || '#2563eb';

  const handleLocationClick = (cluster: LocationCluster) => {
    setSelectedLocationDetail(cluster);
    onSelectLocationCluster(cluster);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span
              className="w-4 h-4 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: categoryColor }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Category Deep-Dive
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {analytics.totalComplaints} Reports
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {category} Complaint Analysis
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigate(`/complaints?category=${encodeURIComponent(category)}`);
              }}
              rightIcon={<ArrowRight size={13} />}
            >
              Open in Queue
            </Button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors"
              title="Close Analysis"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Dynamic Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-5 bg-white border-b border-slate-100 shrink-0">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Total Complaints
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {analytics.totalComplaints}
            </div>
            <span className="text-[10px] text-slate-400">All registered</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Affected Locations
            </span>
            <div className="text-2xl font-bold text-govblue-600 mt-0.5">
              {analytics.totalClusters}
            </div>
            <span className="text-[10px] text-slate-400">Distinct GPS clusters</span>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
              Shared Locations
            </span>
            <div className="text-2xl font-bold text-amber-900 mt-0.5">
              {analytics.multiReportClustersCount}
            </div>
            <span className="text-[10px] text-amber-700 font-medium">
              {analytics.recordsInMultiReportClusters} multi-reports
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Single Reports
            </span>
            <div className="text-2xl font-bold text-slate-700 mt-0.5">
              {analytics.singleReportClustersCount}
            </div>
            <span className="text-[10px] text-slate-400">Isolated incidents</span>
          </div>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="px-6 border-b border-slate-200 bg-slate-50/50 flex space-x-6 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveSubTab('locations')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'locations'
                ? 'border-govblue-600 text-govblue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MapPin size={14} /> Location Groups ({analytics.clusters.length})
          </button>

          <button
            onClick={() => setActiveSubTab('departments')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'departments'
                ? 'border-govblue-600 text-govblue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 size={14} /> Department Breakdown ({analytics.distinctDepartmentsCount} involved)
          </button>

          <button
            onClick={() => setActiveSubTab('records')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'records'
                ? 'border-govblue-600 text-govblue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={14} /> Individual Complaints ({analytics.totalComplaints})
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SubTab 1: Location Groups */}
          {activeSubTab === 'locations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <p>
                  Showing geographic clusters within <strong>100m</strong>. Click any location to highlight on Google Maps.
                </p>
                {selectedLocationDetail && (
                  <button
                    onClick={() => setSelectedLocationDetail(null)}
                    className="text-govblue-600 hover:underline font-medium"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {analytics.clusters.map((cluster) => {
                  const isSelected =
                    selectedClusterId === cluster.id || selectedLocationDetail?.id === cluster.id;
                  const isMulti = cluster.isMultiReport;

                  return (
                    <div
                      key={cluster.id}
                      onClick={() => handleLocationClick(cluster)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-govblue-500 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                isMulti
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {cluster.complaints.length}{' '}
                              {cluster.complaints.length > 1 ? 'Reports' : 'Report'}
                            </span>
                            {isMulti && (
                              <span className="text-[10px] text-amber-700 font-semibold">
                                Shared Location Cluster
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 leading-snug">
                            {cluster.address}
                          </h4>

                          <div className="text-[11px] font-mono text-slate-400">
                            GPS: {cluster.lat.toFixed(4)}, {cluster.lng.toFixed(4)}
                          </div>
                        </div>

                        <Button size="sm" variant={isSelected ? 'primary' : 'outline'} className="shrink-0 text-xs h-8">
                          {isSelected ? 'Focused on Map' : 'Focus Map'}
                        </Button>
                      </div>

                      {/* Complaint IDs pill list */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400 font-medium mr-1">IDs:</span>
                        {cluster.complaintIds.map((cid) => (
                          <Link
                            key={cid}
                            to={`/complaints/${cid}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-govblue-700 hover:bg-govblue-100 hover:underline border border-slate-200"
                          >
                            {cid}
                          </Link>
                        ))}
                      </div>

                      {/* Status & Department Breakdown Badges */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
                        <div>
                          <span className="text-slate-400 font-medium">Status Breakdown:</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {Object.entries(cluster.statusBreakdown).map(([st, cnt]) => (
                              <span key={st} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                                {st}: {cnt}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400 font-medium">Department Assigned:</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {Object.entries(cluster.departmentBreakdown).map(([dept, cnt]) => (
                              <span key={dept} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                                {dept}: {cnt}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {analytics.unlocatedComplaintsCount > 0 && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-600" />
                      {analytics.unlocatedComplaintsCount} Complaints Awaiting Location Geocoding
                    </div>
                    <p className="text-[11px]">
                      These records do not have coordinates yet and are excluded from geographic distance clustering.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SubTab 2: Department Breakdown */}
          {activeSubTab === 'departments' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-govblue-900 leading-relaxed">
                <span className="font-bold flex items-center gap-1.5 mb-1">
                  <Sparkles size={14} className="text-govblue-600" /> Department Assignment vs. Classifier Routing:
                </span>
                Distinguishes between departments with <strong>officially assigned</strong> complaints vs.{' '}
                <strong>recommended routing</strong> determined by the auto-classification rule engine.
              </div>

              <div className="space-y-2.5">
                {analytics.departmentBreakdown.map((d) => {
                  const isUnassigned = d.department === 'Unassigned';
                  return (
                    <div
                      key={d.department}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className={isUnassigned ? 'text-amber-500' : 'text-govblue-600'} />
                          <h4 className="text-sm font-bold text-slate-800">{d.department}</h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isUnassigned
                            ? 'Complaints pending administrative department triage'
                            : `Handling department for ${category}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Assigned
                          </span>
                          <span className="text-base font-bold text-slate-900">
                            {d.assignedCount}
                          </span>
                        </div>

                        <div className="text-right pl-3 border-l border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-govblue-600 block">
                            Recommended
                          </span>
                          <span className="text-base font-bold text-govblue-700">
                            {d.recommendedCount}
                          </span>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs shrink-0"
                          onClick={() => {
                            navigate(
                              `/complaints?category=${encodeURIComponent(category)}&department=${encodeURIComponent(
                                d.department,
                              )}`,
                            );
                          }}
                        >
                          View ({d.assignedCount})
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SubTab 3: Individual Complaints */}
          {activeSubTab === 'records' && (
            <div className="space-y-3">
              {complaints
                .filter((c) => c.category === category)
                .map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-govblue-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/complaints/${c.id}`}
                          className="font-mono text-xs font-bold text-govblue-600 hover:underline"
                        >
                          {c.id}
                        </Link>
                        <StatusBadge status={c.status} />
                        <PriorityBadge priority={c.priority} />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-800 line-clamp-1">{c.title}</h5>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin size={11} className="text-slate-400 shrink-0" />
                        <span className="truncate">{c.location.address}</span>
                      </div>
                    </div>

                    <Link to={`/complaints/${c.id}`} className="shrink-0">
                      <Button size="sm" variant="outline" className="text-xs h-7.5">
                        <Eye size={12} className="mr-1" /> View Detail
                      </Button>
                    </Link>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Selected Category: <strong className="text-slate-800">{category}</strong>
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
