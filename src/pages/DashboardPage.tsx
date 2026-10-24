import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, TrendingUp, CheckCircle2, Circle, Activity, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAnalytics } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardBody, Spinner } from '../components/ui';
import { StatusBadge, PriorityBadge, OverdueBadge } from '../components/ui/Badge';
import { formatRelative, isOverdue, CATEGORY_COLORS } from '../lib/utils';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts';

// ── KPI Card ─────────────────────────────────────────────

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}) {
  return (
    <Card>
      <CardBody className="flex items-start gap-4 py-5">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{title}</p>
          <p className="text-2xl font-bold text-slate-800 mt-0.5 leading-none">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          {trend && <p className="text-xs text-emerald-600 font-medium mt-1">{trend}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Custom tooltip ────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.value} {p.name}
        </p>
      ))}
    </div>
  );
};

// ── Dashboard Page ────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();

  const scopedDept = user?.role !== 'Super Admin' ? user?.department : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', scopedDept],
    queryFn: () => getAnalytics(),
    refetchInterval: 30_000, // refresh every 30s
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  if (!data) return null;

  const { kpi, categoryBreakdown, statusBreakdown, departmentBreakdown, trend, needsAttention } = data;

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

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Welcome back, {user?.name}. Here's the current complaints overview.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total Complaints"
          value={kpi.total}
          icon={<Circle size={20} className="text-white" />}
          color="bg-govblue-600"
        />
        <KpiCard
          title="Open / Pending"
          value={kpi.open}
          subtitle="New + Acknowledged"
          icon={<Activity size={20} className="text-white" />}
          color="bg-blue-500"
        />
        <KpiCard
          title="In Progress"
          value={kpi.inProgress}
          subtitle="Assigned + In Progress"
          icon={<TrendingUp size={20} className="text-white" />}
          color="bg-amber-500"
        />
        <KpiCard
          title="Resolved"
          value={kpi.resolved}
          icon={<CheckCircle2 size={20} className="text-white" />}
          color="bg-emerald-600"
          trend={`+${kpi.resolvedThisWeek} this week (${kpi.resolvedThisWeekPct}%)`}
        />
        <KpiCard
          title="Overdue"
          value={kpi.overdue}
          subtitle="Past SLA deadline"
          icon={<AlertTriangle size={20} className="text-white" />}
          color="bg-red-500"
        />
        <KpiCard
          title="Resolved This Week"
          value={`${kpi.resolvedThisWeek}`}
          icon={<CheckCircle2 size={20} className="text-white" />}
          color="bg-teal-500"
        />
        <KpiCard
          title="Avg Resolution Time"
          value={`${kpi.avgResolutionDays}d`}
          subtitle="Across all resolved"
          icon={<Clock size={20} className="text-white" />}
          color="bg-violet-500"
        />
        <KpiCard
          title="% Resolved (Week)"
          value={`${kpi.resolvedThisWeekPct}%`}
          icon={<TrendingUp size={20} className="text-white" />}
          color="bg-govblue-500"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-700">Complaints Trend (Last 30 Days)</h2>
          </CardHeader>
          <CardBody className="pt-2">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(d) => d.slice(5)}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#trendGrad)"
                  name="Complaints"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Status donut */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-700">By Status</h2>
          </CardHeader>
          <CardBody className="pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={statusBreakdown}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {statusBreakdown.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_CHART_COLORS[entry.status] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(val, name) => [`${val}`, `${name}`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
              {statusBreakdown.map((s) => (
                <div key={s.status} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_CHART_COLORS[s.status] ?? '#94a3b8' }}
                  />
                  <span className="text-xs text-slate-600 truncate">{s.status}</span>
                  <span className="text-xs font-semibold text-slate-800 ml-auto">{s.count}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category bar chart */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-700">By Category</h2>
          </CardHeader>
          <CardBody className="pt-2">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryBreakdown} margin={{ top: 5, right: 5, bottom: 40, left: -20 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={120}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Complaints">
                  {categoryBreakdown.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS] ?? '#94a3b8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Department bar chart */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-700">By Department</h2>
          </CardHeader>
          <CardBody className="pt-2">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={departmentBreakdown} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="department"
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  angle={-15}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="Complaints" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              <h2 className="text-sm font-semibold text-slate-700">Needs Attention</h2>
              <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {needsAttention.length}
              </span>
            </div>
            <Link
              to="/complaints?priority=Critical"
              className="text-xs text-govblue-600 hover:text-govblue-700 font-medium flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <div className="divide-y divide-slate-100">
            {needsAttention.map((c) => (
              <Link
                key={c.id}
                to={`/complaints/${c.id}`}
                className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{c.id}</span>
                    <span className="text-sm font-medium text-slate-800 truncate">{c.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={c.status} />
                    <PriorityBadge priority={c.priority} />
                    {isOverdue(c.dueDate, c.status) && <OverdueBadge />}
                    <span className="text-xs text-slate-400">{c.location.address}</span>
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{formatRelative(c.reportedAt)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
