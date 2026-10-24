import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Clock, TrendingUp, CheckCircle2, Circle, Activity,
  ArrowRight, MapPin, Building2, Layers, Sparkles, Filter, RefreshCw
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getAnalytics, getComplaints, isMockMode } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardBody, Spinner, Button } from '../components/ui';
import { StatusBadge, PriorityBadge, OverdueBadge } from '../components/ui/Badge';
import { formatRelative, isOverdue, CATEGORY_COLORS } from '../lib/utils';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { ComplaintMap } from '../components/dashboard/ComplaintMap';
import { CategoryAnalysisDrawer } from '../components/dashboard/CategoryAnalysisDrawer';
import type { ComplaintCategory, Department } from '../types';
import type { LocationCluster } from '../lib/locationAnalytics';

// ── Interactive KPI Card ──────────────────────────────────

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
  trend,
  href,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: string;
  href?: string;
}) {
  const content = (
    <CardBody className="flex items-start gap-4 py-5 h-full">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${color}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
            {title}
          </p>
          {href && (
            <ArrowRight
              size={13}
              className="text-slate-300 group-hover:text-govblue-600 group-hover:translate-x-0.5 transition-all"
            />
          )}
        </div>
        <p className="text-2xl font-bold text-slate-800 mt-0.5 leading-none">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        {trend && <p className="text-xs text-emerald-600 font-medium mt-1">{trend}</p>}
      </div>
    </CardBody>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="block group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-govblue-500"
      >
        <Card className="h-full transition-all duration-150 group-hover:border-govblue-300 group-hover:shadow-md">
          {content}
        </Card>
      </Link>
    );
  }

  return <Card className="h-full">{content}</Card>;
}

// ── Custom Tooltip ────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-800">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-medium mt-0.5" style={{ color: p.color || p.fill }}>
          {p.value} {p.name || 'Complaints'}
        </p>
      ))}
      <p className="text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-100">
        Click bar to inspect details
      </p>
    </div>
  );
};

// ── Dashboard Page ────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const scopedDept = user?.role !== 'Super Admin' ? user?.department : undefined;

  // Analytics query
  const {
    data: analytics,
    isLoading: isAnalyticsLoading,
    isError: isAnalyticsError,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['analytics', scopedDept],
    queryFn: () => getAnalytics(),
    refetchInterval: 30_000,
  });

  // Complaints dataset query for the map and location drill-down
  const {
    data: complaints = [],
    isLoading: isComplaintsLoading,
    isError: isComplaintsError,
    error: complaintsError,
    refetch: refetchComplaints,
  } = useQuery({
    queryKey: ['complaints'],
    queryFn: () => getComplaints(),
  });

  // Interactive cross-component filtering state
  const [selectedMapCategory, setSelectedMapCategory] = useState<ComplaintCategory | 'All'>('All');
  const [selectedMapDepartment, setSelectedMapDepartment] = useState<Department | 'All'>('All');
  const [focusCoordinates, setFocusCoordinates] = useState<{ lat: number; lng: number } | null>(null);

  // Category analysis drawer state
  const [selectedCategoryForAnalysis, setSelectedCategoryForAnalysis] = useState<ComplaintCategory | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  if (isAnalyticsLoading || isComplaintsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 text-slate-400">
        <Spinner size={32} />
        <p className="mt-3 text-xs font-semibold">Loading CivicSense Dashboard...</p>
      </div>
    );
  }

  if (isAnalyticsError || isComplaintsError) {
    const errorMsg =
      (analyticsError as Error)?.message ||
      (complaintsError as Error)?.message ||
      'Unable to connect to CivicSense backend server.';

    return (
      <div className="py-20 flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
        <AlertTriangle className="text-amber-500 mb-3" size={40} />
        <h2 className="text-lg font-bold text-slate-800">Backend Server Unavailable</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {errorMsg}
        </p>
        <div className="flex items-center gap-3 mt-4">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              refetchAnalytics();
              refetchComplaints();
            }}
            leftIcon={<RefreshCw size={13} />}
          >
            Retry Connection
          </Button>
          <Link to="/login">
            <Button size="sm" variant="secondary">
              Sign In Again
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const { kpi, categoryBreakdown, statusBreakdown, departmentBreakdown, needsAttention } = analytics;

  const STATUS_CHART_COLORS: Record<string, string> = {
    New: '#94a3b8',
    Acknowledged: '#3b82f6',
    Assigned: '#6366f1',
    'In Progress': '#f59e0b',
    Resolved: '#10b981',
    Closed: '#22c55e',
    Rejected: '#ef4444',
    Duplicate: '#a855f7',
  };

  // Handle clicking a category in the bar chart
  const handleCategoryBarClick = (data: any) => {
    const category = data?.activePayload?.[0]?.payload?.category || data?.category;
    if (category) {
      setSelectedCategoryForAnalysis(category as ComplaintCategory);
      setSelectedMapCategory(category as ComplaintCategory);
    }
  };

  // Handle clicking a department in the department chart
  const handleDepartmentBarClick = (data: any) => {
    const dept = data?.activePayload?.[0]?.payload?.department || data?.department;
    if (dept) {
      if (dept === 'Unassigned') {
        navigate('/complaints?department=Unassigned');
      } else {
        navigate(`/complaints?department=${encodeURIComponent(dept)}`);
      }
    }
  };

  const handleSelectLocationCluster = (cluster: LocationCluster) => {
    setSelectedClusterId(cluster.id);
    setFocusCoordinates({ lat: cluster.lat, lng: cluster.lng });
  };

  return (
    <div className="space-y-6">
      {/* Page Heading & Active Filter Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Welcome back, <strong className="text-slate-700">{user?.name}</strong>. Real-time civic complaint triage & geographic monitoring.
          </p>
        </div>

        {selectedMapCategory !== 'All' && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs">
            <span className="text-govblue-800 font-semibold">
              Filtered to: <strong>{selectedMapCategory}</strong>
            </span>
            <button
              onClick={() => {
                setSelectedMapCategory('All');
                setFocusCoordinates(null);
                setSelectedCategoryForAnalysis(null);
              }}
              className="text-govblue-600 hover:text-govblue-800 underline font-medium ml-1"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* KPI Grid (Clickable controls for navigation) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Reports"
          value={kpi.total}
          subtitle={(kpi as any).parentIssues ? `${(kpi as any).parentIssues} parent issues + duplicates` : 'All citizen reports'}
          icon={<Circle size={20} className="text-white" />}
          color="bg-govblue-600"
          href="/complaints"
        />
        <KpiCard
          title="Open / Pending"
          value={kpi.open}
          subtitle="New + Acknowledged"
          icon={<Activity size={20} className="text-white" />}
          color="bg-blue-500"
          href="/complaints?status=open"
        />
        <KpiCard
          title="In Progress"
          value={kpi.inProgress}
          subtitle="Assigned + Active field crew"
          icon={<TrendingUp size={20} className="text-white" />}
          color="bg-amber-500"
          href="/complaints?status=in-progress"
        />
        <KpiCard
          title="Resolved"
          value={kpi.resolved}
          icon={<CheckCircle2 size={20} className="text-white" />}
          color="bg-emerald-600"
          trend={`+${kpi.resolvedThisWeek} this week (${kpi.resolvedThisWeekPct}%)`}
          href="/complaints?status=Resolved"
        />
        <KpiCard
          title="Overdue"
          value={isMockMode ? kpi.overdue : 'N/A'}
          subtitle={isMockMode ? 'Past SLA resolution limit' : 'SLA not tracked by backend'}
          icon={<AlertTriangle size={20} className="text-white" />}
          color="bg-red-500"
          href="/complaints?overdue=true"
        />
        <KpiCard
          title="Resolved This Week"
          value={`${kpi.resolvedThisWeek}`}
          subtitle="Last 7 calendar days"
          icon={<CheckCircle2 size={20} className="text-white" />}
          color="bg-teal-500"
          href="/complaints?filter=resolvedThisWeek"
        />
        <KpiCard
          title="Avg Resolution Time"
          value={`${kpi.avgResolutionDays}d`}
          subtitle="From intake to proof"
          icon={<Clock size={20} className="text-white" />}
          color="bg-violet-500"
          href="/analytics"
        />
        <KpiCard
          title="% Resolved (Week)"
          value={`${kpi.resolvedThisWeekPct}%`}
          subtitle="Weekly clearance velocity"
          icon={<TrendingUp size={20} className="text-white" />}
          color="bg-govblue-500"
          href="/complaints?status=Resolved"
        />
      </div>

      {/* Primary Map Section + Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Prominent Interactive Google Map */}
        <Card className="lg:col-span-2 overflow-hidden flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-rose-500" />
                <h2 className="text-base font-bold text-slate-800">Geographic Complaint Monitor</h2>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                  Google Maps
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-report clusters, category colored pins, and location hotspots across Bengaluru wards.
              </p>
            </div>

            {selectedCategoryForAnalysis && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedCategoryForAnalysis(selectedCategoryForAnalysis)}
                className="text-xs shrink-0"
              >
                Inspect {selectedCategoryForAnalysis}
              </Button>
            )}
          </CardHeader>

          <CardBody className="p-4 flex-1">
            <ComplaintMap
              complaints={complaints}
              selectedCategory={selectedMapCategory}
              selectedDepartment={selectedMapDepartment}
              focusCoordinates={focusCoordinates}
              onSelectCategory={(cat) => {
                setSelectedMapCategory(cat);
                if (cat !== 'All') {
                  setSelectedCategoryForAnalysis(cat);
                }
              }}
              onSelectDepartment={(dept) => setSelectedMapDepartment(dept)}
              onClearFocus={() => setFocusCoordinates(null)}
            />
          </CardBody>
        </Card>

        {/* Status Distribution Donut */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Status Distribution</h2>
              <span className="text-[11px] text-slate-400">{kpi.total} total</span>
            </div>
          </CardHeader>

          <CardBody className="pt-2 flex flex-col justify-between flex-1">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {statusBreakdown.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_CHART_COLORS[entry.status] ?? '#94a3b8'}
                        className="cursor-pointer hover:opacity-85"
                        onClick={() => navigate(`/complaints?status=${encodeURIComponent(entry.status)}`)}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val, name) => [`${val} complaints`, `${name}`]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 pt-3 border-t border-slate-100">
              {statusBreakdown.map((s) => (
                <Link
                  key={s.status}
                  to={`/complaints?status=${encodeURIComponent(s.status)}`}
                  className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-50 transition-colors group"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_CHART_COLORS[s.status] ?? '#94a3b8' }}
                  />
                  <span className="text-xs text-slate-600 group-hover:text-slate-900 truncate">
                    {s.status}
                  </span>
                  <span className="text-xs font-bold text-slate-800 ml-auto">{s.count}</span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Interactive Category & Department Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category bar chart (Clickable -> Opens Deep Dive Analysis) */}
        <Card className="hover:border-slate-300 transition-colors">
          <CardHeader className="pb-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-govblue-600" />
                <h2 className="text-sm font-bold text-slate-800">Complaints by Category</h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                💡 <strong className="text-govblue-700">Click any bar</strong> to open full location cluster & department analysis.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-govblue-600 bg-govblue-50 px-2 py-0.5 rounded border border-govblue-200">
              Interactive Drill-Down
            </span>
          </CardHeader>

          <CardBody className="pt-3">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryBreakdown}
                  margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
                  layout="vertical"
                  onClick={handleCategoryBarClick}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={130}
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 500 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Complaints">
                    {categoryBreakdown.map((entry) => (
                      <Cell
                        key={entry.category}
                        fill={CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS] ?? '#94a3b8'}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Department bar chart (Clickable -> Filters or navigates) */}
        <Card className="hover:border-slate-300 transition-colors">
          <CardHeader className="pb-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-govblue-600" />
                <h2 className="text-sm font-bold text-slate-800">Complaints by Department</h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Assigned workloads across civic departments. Click bar to open queue.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              All 5 Departments
            </span>
          </CardHeader>

          <CardBody className="pt-3">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={departmentBreakdown}
                  margin={{ top: 5, right: 10, bottom: 25, left: -10 }}
                  onClick={handleDepartmentBarClick}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="department"
                    tick={{ fontSize: 10, fill: '#475569', fontWeight: 500 }}
                    angle={-18}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                    name="Complaints"
                    className="hover:fill-govblue-700 transition-colors"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Needs Attention Panel (Maintained intact as requested) */}
      {needsAttention.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              <h2 className="text-sm font-bold text-slate-900">Immediate Action Required</h2>
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {needsAttention.length} Urgent Tickets
              </span>
            </div>
            <Link
              to="/complaints?priority=Critical"
              className="text-xs text-govblue-600 hover:text-govblue-700 font-semibold flex items-center gap-1"
            >
              View critical queue <ArrowRight size={13} />
            </Link>
          </CardHeader>
          <div className="divide-y divide-slate-100">
            {needsAttention.map((c) => (
              <Link
                key={c.id}
                to={`/complaints/${c.id}`}
                className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-govblue-600">{c.id}</span>
                    <span className="text-sm font-semibold text-slate-800 truncate">{c.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={c.status} />
                    <PriorityBadge priority={c.priority} />
                    {isOverdue(c.dueDate, c.status) && <OverdueBadge />}
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin size={11} className="text-slate-400" />
                      {c.location.address}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0 font-medium">
                  {formatRelative(c.reportedAt)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Detailed Category Analysis Side Drawer */}
      {selectedCategoryForAnalysis && (
        <CategoryAnalysisDrawer
          category={selectedCategoryForAnalysis}
          complaints={complaints}
          isOpen={Boolean(selectedCategoryForAnalysis)}
          onClose={() => {
            setSelectedCategoryForAnalysis(null);
            setSelectedClusterId(null);
          }}
          onSelectLocationCluster={handleSelectLocationCluster}
          selectedClusterId={selectedClusterId}
        />
      )}
    </div>
  );
}
