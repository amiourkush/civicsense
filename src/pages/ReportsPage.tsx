import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download, Filter, FileSpreadsheet, BarChart2, PieChart as PieChartIcon,
  CheckCircle2, Clock, AlertTriangle, Building2, RefreshCw, Calendar
} from 'lucide-react';
import { getComplaints, getAnalytics } from '../lib/api';
import { Card, CardHeader, CardBody, Button, Spinner } from '../components/ui';
import { StatusBadge, PriorityBadge, CategoryBadge } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import type { ComplaintCategory, Department, ComplaintStatus } from '../types';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

export function ReportsPage() {
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const {
    data: complaints = [],
    isLoading: isLoadingComplaints,
    isError: isComplaintsError,
    error: complaintsError,
    refetch: refetchComplaints,
  } = useQuery({
    queryKey: ['complaints'],
    queryFn: () => getComplaints(),
  });

  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    isError: isAnalyticsError,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => getAnalytics(),
  });

  const isError = isComplaintsError || isAnalyticsError;
  const errorMessage =
    (complaintsError as Error)?.message ||
    (analyticsError as Error)?.message ||
    'Unable to load analytics data from server.';

  // Filter complaints for report table & export
  const filteredData = useMemo(() => {
    return complaints.filter((c) => {
      if (selectedDept && c.assignedDepartment !== selectedDept) return false;
      if (selectedStatus && c.status !== selectedStatus) return false;
      return true;
    });
  }, [complaints, selectedDept, selectedStatus]);

  // Export CSV handler
  const handleExportCSV = () => {
    if (filteredData.length === 0) return;

    const headers = [
      'Complaint ID',
      'Title',
      'Category',
      'Status',
      'Priority',
      'Assigned Department',
      'Assigned Officer',
      'Address',
      'Latitude',
      'Longitude',
      'Reported Date',
      'Due Date',
      'Duplicate Of',
      'Evidence Count',
    ];

    const rows = filteredData.map((c) => [
      `"${c.id}"`,
      `"${c.title.replace(/"/g, '""')}"`,
      `"${c.category}"`,
      `"${c.status}"`,
      `"${c.priority}"`,
      `"${c.assignedDepartment || 'Unassigned'}"`,
      `"${c.assignedOfficer || 'Unassigned'}"`,
      `"${c.location.address.replace(/"/g, '""')}"`,
      c.location.lat !== null && c.location.lat !== undefined ? c.location.lat : '',
      c.location.lng !== null && c.location.lng !== undefined ? c.location.lng : '',
      c.reportedAt,
      c.dueDate,
      `"${c.duplicateOf || ''}"`,
      c.evidence.length,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `CivicSense_Report_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isLoading = isLoadingComplaints || isLoadingAnalytics;

  if (isError) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
        <AlertTriangle className="text-amber-500 mb-3" size={40} />
        <h2 className="text-lg font-bold text-slate-800">Backend Server Unavailable</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {errorMessage}
        </p>
        <Button
          size="sm"
          variant="primary"
          className="mt-4"
          onClick={() => {
            refetchComplaints();
            refetchAnalytics();
          }}
          leftIcon={<RefreshCw size={13} />}
        >
          Retry Connection
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analytics & Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Department performance benchmarks, resolution velocity, and exportable civic logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download size={14} />}
          >
            Export CSV ({filteredData.length} Records)
          </Button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardBody className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total Volume
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{analytics.kpi.total}</p>
              <span className="text-xs text-slate-500">Citizen reported cases</span>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Resolved This Week
              </span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {analytics.kpi.resolvedThisWeek}
              </p>
              <span className="text-xs text-emerald-600 font-medium">
                {analytics.kpi.resolvedThisWeekPct}% of total volume
              </span>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Avg Resolution SLA
              </span>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {analytics.kpi.avgResolutionDays} <span className="text-sm font-normal text-slate-500">days</span>
              </p>
              <span className="text-xs text-slate-500">From intake to verified proof</span>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Overdue Escalations
              </span>
              <p className="text-2xl font-bold text-red-600 mt-1">{analytics.kpi.overdue}</p>
              <span className="text-xs text-red-500 font-medium">Breached target SLA</span>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Analytics Charts */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Department Breakdown */}
          <Card>
            <CardHeader className="pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 size={16} className="text-govblue-600" /> Complaints by Department
              </h3>
            </CardHeader>
            <CardBody className="pt-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.departmentBreakdown} layout="vertical" margin={{ left: 30, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" fontSize={11} stroke="#64748b" />
                    <YAxis
                      dataKey="department"
                      type="category"
                      fontSize={11}
                      stroke="#64748b"
                      width={120}
                      tick={{ fill: '#334155' }}
                    />
                    <Tooltip
                      formatter={(val: any) => [`${val} complaints`, 'Total']}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          {/* Category Distribution */}
          <Card>
            <CardHeader className="pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieChartIcon size={16} className="text-govblue-600" /> Category Distribution
              </h3>
            </CardHeader>
            <CardBody className="pt-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.categoryBreakdown}
                      dataKey="count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {analytics.categoryBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [`${val} complaints`, 'Count']}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Exportable Report Table */}
      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Civic Audit Dataset</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Filtered dataset ready for regulatory export, department audits, and council review.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="text-xs py-1.5 px-2.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:ring-1 focus:ring-govblue-500"
              >
                <option value="">All Departments</option>
                <option value="Sanitation">Sanitation</option>
                <option value="Roads & Infrastructure">Roads & Infrastructure</option>
                <option value="Electrical / Streetlights">Electrical / Streetlights</option>
                <option value="Water & Drainage">Water & Drainage</option>
                <option value="Parks">Parks</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs py-1.5 px-2.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:ring-1 focus:ring-govblue-500"
              >
                <option value="">All Statuses</option>
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
        </CardHeader>

        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <Spinner size="lg" />
              <p className="mt-2 text-xs">Loading report dataset...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No complaint records match selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-3">Title</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3">Officer</th>
                    <th className="py-3 px-3">Reported</th>
                    <th className="py-3 px-4">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.slice(0, 25).map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-govblue-600">
                        {c.id}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 max-w-xs truncate">
                        {c.title}
                      </td>
                      <td className="py-2.5 px-3">
                        <CategoryBadge category={c.category} />
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {c.assignedDepartment || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {c.assignedOfficer || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {formatDate(c.reportedAt)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                        {formatDate(c.dueDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredData.length > 25 && (
                <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500">
                  Showing first 25 of {filteredData.length} records. Download CSV for full audit export.
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
