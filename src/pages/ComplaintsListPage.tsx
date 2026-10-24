import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, Filter, ArrowUpDown, ChevronDown, CheckSquare, Square,
  Eye, RefreshCw, X, AlertTriangle, Users, Tag, CheckCircle2,
  Calendar, Layers, MapPin, Building2, SlidersHorizontal, AlertCircle,
  Clock, CheckCheck
} from 'lucide-react';
import { getComplaints, bulkUpdateStatus, bulkAssign, getUsers, isMockMode } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardBody, Button, Input, Select, Spinner } from '../components/ui';
import { StatusBadge, PriorityBadge, OverdueBadge, CategoryBadge } from '../components/ui/Badge';
import { formatDate, formatRelative, isOverdue } from '../lib/utils';
import type { Complaint, ComplaintStatus, ComplaintCategory, ComplaintPriority, Department } from '../types';

const CATEGORIES: ComplaintCategory[] = [
  'Waste & Garbage',
  'Roads & Potholes',
  'Streetlights',
  'Water Supply',
  'Drainage',
  'Parks & Recreation',
  'Noise Pollution',
  'Other',
];

const STATUSES: ComplaintStatus[] = [
  'New',
  'Acknowledged',
  'Assigned',
  'In Progress',
  'Resolved',
  'Closed',
  'Rejected',
  'Duplicate',
];

const PRIORITIES: ComplaintPriority[] = ['Low', 'Medium', 'High', 'Critical'];

const DEPARTMENTS: Department[] = [
  'Sanitation',
  'Roads & Infrastructure',
  'Electrical / Streetlights',
  'Water & Drainage',
  'Parks',
];

export function ComplaintsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL search params
  const paramCategory = searchParams.get('category') || '';
  const paramStatus = searchParams.get('status') || '';
  const paramDepartment = searchParams.get('department') || '';
  const paramPriority = searchParams.get('priority') || '';
  const paramSearch = searchParams.get('q') || searchParams.get('search') || '';
  const paramOverdue = searchParams.get('overdue') === 'true' || searchParams.get('filter') === 'overdue';
  const paramResolvedThisWeek = searchParams.get('filter') === 'resolvedThisWeek';

  // Filters state initialized from URL
  const [search, setSearch] = useState(paramSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>(paramCategory);
  const [selectedStatus, setSelectedStatus] = useState<string>(paramStatus);
  const [selectedDepartment, setSelectedDepartment] = useState<string>(paramDepartment);
  const [selectedPriority, setSelectedPriority] = useState<string>(paramPriority);
  const [isOverdueOnly, setIsOverdueOnly] = useState<boolean>(paramOverdue);
  const [isResolvedThisWeekOnly, setIsResolvedThisWeekOnly] = useState<boolean>(paramResolvedThisWeek);
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'priority-desc' | 'due-asc'>('date-desc');
  const [scopeToMyDept, setScopeToMyDept] = useState<boolean>(false);

  // Sync state when URL params change (e.g. back/forward button)
  useEffect(() => {
    setSelectedCategory(searchParams.get('category') || '');
    setSelectedStatus(searchParams.get('status') || '');
    setSelectedDepartment(searchParams.get('department') || '');
    setSelectedPriority(searchParams.get('priority') || '');
    setSearch(searchParams.get('q') || searchParams.get('search') || '');
    setIsOverdueOnly(searchParams.get('overdue') === 'true' || searchParams.get('filter') === 'overdue');
    setIsResolvedThisWeekOnly(searchParams.get('filter') === 'resolvedThisWeek');
  }, [searchParams]);

  // Helper to sync local filter change to URL
  const updateQueryParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, val] of Object.entries(updates)) {
      if (val !== null && val !== '') {
        next.set(key, val);
      } else {
        next.delete(key);
      }
    }
    setSearchParams(next, { replace: true });
  };

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Bulk action modals
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState<ComplaintStatus>('Acknowledged');
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
  const [bulkAssignDept, setBulkAssignDept] = useState<Department>('Sanitation');
  const [bulkAssignOfficer, setBulkAssignOfficer] = useState('');

  // Fetch users for assignment
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const departmentUsers = useMemo(() => {
    return users.filter((u) => u.department === bulkAssignDept);
  }, [users, bulkAssignDept]);

  // Query complaints with backend parameters and error tracking
  const {
    data: complaints = [],
    isLoading,
    isRefetching,
    isError,
    error: complaintsError,
    refetch,
  } = useQuery({
    queryKey: ['complaints', selectedCategory, selectedStatus, selectedDepartment, search],
    queryFn: () =>
      getComplaints({
        category: selectedCategory as any,
        status: selectedStatus as any,
        department: selectedDepartment as any,
        search,
      }),
  });

  // Bulk status mutation
  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await bulkUpdateStatus(selectedIds, bulkStatusTarget, user.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setSelectedIds([]);
      setIsBulkStatusModalOpen(false);
    },
  });

  // Bulk assign mutation
  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await bulkAssign(selectedIds, bulkAssignDept, bulkAssignOfficer || 'Unassigned', user.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setSelectedIds([]);
      setIsBulkAssignModalOpen(false);
    },
  });

  // Filtered & sorted complaints
  const filteredComplaints = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);

    return complaints.filter((c) => {
      if (scopeToMyDept && user?.department && c.assignedDepartment !== user.department) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchesId = c.id.toLowerCase().includes(q);
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesDesc = c.description.toLowerCase().includes(q);
        const matchesAddress = c.location?.address ? c.location.address.toLowerCase().includes(q) : false;
        if (!matchesId && !matchesTitle && !matchesDesc && !matchesAddress) return false;
      }
      if (selectedCategory && c.category !== selectedCategory) return false;

      // Status filtering with group support
      if (selectedStatus) {
        if (selectedStatus.toLowerCase() === 'open') {
          if (c.status !== 'New' && c.status !== 'Acknowledged') return false;
        } else if (selectedStatus.toLowerCase() === 'in-progress') {
          if (c.status !== 'Assigned' && c.status !== 'In Progress') return false;
        } else if (selectedStatus.includes(',')) {
          const list = selectedStatus.split(',').map((s) => s.trim());
          if (!list.includes(c.status)) return false;
        } else if (c.status !== selectedStatus) {
          return false;
        }
      }

      // Department filtering including Unassigned
      if (selectedDepartment) {
        if (selectedDepartment === 'Unassigned') {
          if (c.assignedDepartment) return false;
        } else if (c.assignedDepartment !== selectedDepartment) {
          return false;
        }
      }

      if (selectedPriority && c.priority !== selectedPriority) return false;

      if (isOverdueOnly) {
        if (!isOverdue(c.dueDate, c.status)) return false;
      }

      if (isResolvedThisWeekOnly) {
        const lastEntry = c.timeline[c.timeline.length - 1];
        if (c.status !== 'Resolved') return false;
        if (!lastEntry || new Date(lastEntry.changedAt) < oneWeekAgo) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'date-desc') {
        return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
      }
      if (sortBy === 'date-asc') {
        return new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime();
      }
      if (sortBy === 'due-asc') {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortBy === 'priority-desc') {
        const pMap: Record<ComplaintPriority, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
        return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
      }
      return 0;
    });
  }, [
    complaints, search, selectedCategory, selectedStatus, selectedDepartment,
    selectedPriority, isOverdueOnly, isResolvedThisWeekOnly, sortBy, scopeToMyDept, user
  ]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredComplaints.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredComplaints.map((c) => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const hasActiveFilters = Boolean(
    search || selectedCategory || selectedStatus || selectedDepartment || selectedPriority || isOverdueOnly || isResolvedThisWeekOnly
  );

  const clearFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedStatus('');
    setSelectedDepartment('');
    setSelectedPriority('');
    setIsOverdueOnly(false);
    setIsResolvedThisWeekOnly(false);
    setScopeToMyDept(false);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  // Status Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: complaints.length,
      open: complaints.filter((c) => c.status === 'New' || c.status === 'Acknowledged').length,
      inProgress: complaints.filter((c) => c.status === 'Assigned' || c.status === 'In Progress').length,
      resolved: complaints.filter((c) => c.status === 'Resolved').length,
      overdue: complaints.filter((c) => isOverdue(c.dueDate, c.status)).length,
      duplicate: complaints.filter((c) => c.status === 'Duplicate').length,
      closed: complaints.filter((c) => c.status === 'Closed').length,
      rejected: complaints.filter((c) => c.status === 'Rejected').length,
    };
  }, [complaints]);

  // Current active status tab
  const activeTabKey = useMemo(() => {
    if (isOverdueOnly) return 'overdue';
    if (!selectedStatus) return 'all';
    const s = selectedStatus.toLowerCase();
    if (s === 'open') return 'open';
    if (s === 'in-progress') return 'inProgress';
    if (s === 'resolved') return 'resolved';
    if (s === 'duplicate') return 'duplicate';
    if (s === 'closed') return 'closed';
    if (s === 'rejected') return 'rejected';
    return selectedStatus;
  }, [selectedStatus, isOverdueOnly]);

  const handleTabClick = (key: string) => {
    if (key === 'all') {
      setSelectedStatus('');
      setIsOverdueOnly(false);
      updateQueryParam({ status: null, overdue: null, filter: null });
    } else if (key === 'open') {
      setSelectedStatus('open');
      setIsOverdueOnly(false);
      updateQueryParam({ status: 'open', overdue: null, filter: null });
    } else if (key === 'inProgress') {
      setSelectedStatus('in-progress');
      setIsOverdueOnly(false);
      updateQueryParam({ status: 'in-progress', overdue: null, filter: null });
    } else if (key === 'overdue') {
      setSelectedStatus('');
      setIsOverdueOnly(true);
      updateQueryParam({ status: null, overdue: 'true', filter: null });
    } else {
      setSelectedStatus(key);
      setIsOverdueOnly(false);
      updateQueryParam({ status: key, overdue: null, filter: null });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Complaints Queue</h1>
            <span className="bg-govblue-50 text-govblue-700 font-semibold px-2.5 py-0.5 rounded-full text-xs border border-govblue-200">
              {filteredComplaints.length} of {complaints.length} Records
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Triage, prioritize, assign, and track citizen reported civic issues across departments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user?.department && (
            <button
              onClick={() => setScopeToMyDept(!scopeToMyDept)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                scopeToMyDept
                  ? 'bg-govblue-600 text-white border-govblue-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {scopeToMyDept ? `Scoped: ${user.department}` : `Scope to ${user.department}`}
            </button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['complaints'] })}
            leftIcon={<RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Status Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {[
          { key: 'all', label: 'All', count: tabCounts.all },
          { key: 'open', label: 'Open / Pending', count: tabCounts.open },
          { key: 'inProgress', label: 'In Progress', count: tabCounts.inProgress },
          { key: 'resolved', label: 'Resolved', count: tabCounts.resolved },
          { key: 'overdue', label: 'Overdue', count: tabCounts.overdue, isOverdue: true },
          { key: 'duplicate', label: 'Duplicates', count: tabCounts.duplicate },
          { key: 'closed', label: 'Closed', count: tabCounts.closed },
          { key: 'rejected', label: 'Rejected', count: tabCounts.rejected },
        ].map((tab) => {
          const isActive = activeTabKey === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border ${
                isActive
                  ? 'bg-govblue-600 text-white border-govblue-600 shadow-sm'
                  : tab.isOverdue && tab.count > 0
                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : tab.isOverdue && tab.count > 0
                    ? 'bg-red-200 text-red-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardBody className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID, keyword, description, or address..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  updateQueryParam({ q: e.target.value });
                }}
                className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-govblue-500 transition-all placeholder:text-slate-400"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch('');
                    updateQueryParam({ q: null });
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 shrink-0">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs py-2 px-3 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-govblue-500 cursor-pointer"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="priority-desc">Highest Priority</option>
                <option value="due-asc">SLA / Earliest Due</option>
              </select>
            </div>
          </div>

          {/* Quick Select Filter Dropdowns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
            <div>
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  updateQueryParam({ category: e.target.value });
                }}
                className="w-full text-xs py-1.5 px-2.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:ring-1 focus:ring-govblue-500 cursor-pointer"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setIsOverdueOnly(false);
                  updateQueryParam({ status: e.target.value, overdue: null });
                }}
                className="w-full text-xs py-1.5 px-2.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:ring-1 focus:ring-govblue-500 cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="open">Open / Pending (New + Ack)</option>
                <option value="in-progress">In Progress (Assigned + Active)</option>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                Department
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  updateQueryParam({ department: e.target.value });
                }}
                className="w-full text-xs py-1.5 px-2.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:ring-1 focus:ring-govblue-500 cursor-pointer"
              >
                <option value="">All Departments</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                Priority
              </label>
              <select
                value={selectedPriority}
                onChange={(e) => {
                  setSelectedPriority(e.target.value);
                  updateQueryParam({ priority: e.target.value });
                }}
                className="w-full text-xs py-1.5 px-2.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:ring-1 focus:ring-govblue-500 cursor-pointer"
              >
                <option value="">All Priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              {hasActiveFilters ? (
                <button
                  onClick={clearFilters}
                  className="w-full text-xs py-1.5 px-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md flex items-center justify-center gap-1.5 font-medium transition-colors"
                >
                  <X size={12} /> Clear Filters
                </button>
              ) : (
                <div className="text-[11px] text-slate-400 py-1.5 flex items-center justify-center w-full">
                  Showing all records
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-20 z-20 bg-govblue-900 text-white p-3.5 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 border border-govblue-700">
          <div className="flex items-center gap-3">
            <span className="bg-govblue-700 text-white font-bold px-2.5 py-1 rounded-md text-xs">
              {selectedIds.length} Selected
            </span>
            <span className="text-sm font-medium text-govblue-100 hidden sm:inline">
              Perform bulk operations on selected complaints:
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsBulkStatusModalOpen(true)}
              leftIcon={<CheckCircle2 size={14} className="text-govblue-600" />}
            >
              Update Status
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsBulkAssignModalOpen(true)}
              leftIcon={<Users size={14} className="text-govblue-600" />}
            >
              Assign Department
            </Button>

            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-govblue-300 hover:text-white px-2 py-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Complaints Table */}
      <Card className="overflow-hidden">
        {isError ? (
          <div className="py-16 text-center max-w-md mx-auto px-4">
            <AlertCircle className="mx-auto text-red-500 mb-3" size={36} />
            <h3 className="text-base font-bold text-slate-800">Failed to Retrieve Complaints</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {(complaintsError as Error)?.message || 'Unable to connect to the backend server. Please verify Spring Boot is active.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => refetch()}
              leftIcon={<RefreshCw size={13} className={isRefetching ? 'animate-spin' : ''} />}
            >
              Retry Connection
            </Button>
          </div>
        ) : isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Spinner size="lg" />
            <p className="mt-3 text-sm font-medium">Loading complaints queue...</p>
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Search size={20} />
            </div>
            <h3 className="text-base font-semibold text-slate-800">No complaints found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              No civic complaints match your current search or filter criteria. Try clearing some filters.
            </p>
            {hasActiveFilters && (
              <Button size="sm" variant="outline" className="mt-4" onClick={clearFilters}>
                Reset all filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-10">
                    <button
                      onClick={toggleSelectAll}
                      className="text-slate-400 hover:text-slate-700 flex items-center"
                    >
                      {selectedIds.length === filteredComplaints.length && filteredComplaints.length > 0 ? (
                        <CheckSquare size={16} className="text-govblue-600" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-3">Complaint</th>
                  <th className="py-3.5 px-3">Category</th>
                  <th className="py-3.5 px-3">Priority</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Department & Assignee</th>
                  <th className="py-3.5 px-3">Reported</th>
                  <th className="py-3.5 px-3">SLA / Due</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredComplaints.map((c) => {
                  const overdue = isOverdue(c.dueDate, c.status);
                  const isSelected = selectedIds.includes(c.id);
                  const isDup = Boolean(c.duplicateOf);
                  const hasMerged = Boolean(c.mergedComplaints && c.mergedComplaints.length > 0);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/complaints/${c.id}`)}
                      className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelectOne(c.id)}
                          className="text-slate-400 hover:text-slate-700 flex items-center"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-govblue-600" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>

                      {/* Complaint ID & Title */}
                      <td className="py-3.5 px-3 max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-govblue-600">
                            {c.id}
                          </span>
                          {isDup && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium border border-purple-200">
                              Duplicate of {c.duplicateOf}
                            </span>
                          )}
                          {hasMerged && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium border border-amber-200">
                              +{c.mergedComplaints?.length} merged
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-slate-800 hover:text-govblue-600 line-clamp-1 mt-0.5">
                          {c.title}
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 text-xs mt-0.5 line-clamp-1">
                          <MapPin size={11} className="shrink-0 text-slate-400" />
                          <span className="truncate">{c.location?.address || 'Location pending'}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-3">
                        <CategoryBadge category={c.category} />
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-3">
                        <PriorityBadge priority={c.priority} />
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        <StatusBadge status={c.status} />
                      </td>

                      {/* Department & Assignee */}
                      <td className="py-3.5 px-3">
                        <div className="text-xs font-medium text-slate-800">
                          {c.assignedDepartment || <span className="text-slate-400 italic">Unassigned</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {c.assignedOfficer || 'No officer assigned'}
                        </div>
                      </td>

                      {/* Reported */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs text-slate-600">
                        <div>{formatDate(c.reportedAt)}</div>
                        <div className="text-[11px] text-slate-400">{formatRelative(c.reportedAt)}</div>
                      </td>

                      {/* SLA / Due */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs">
                        {overdue ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-200 text-xs">
                              <AlertCircle size={11} /> Overdue
                            </span>
                            <div className="text-[10px] text-red-500 mt-0.5">Due: {formatDate(c.dueDate)}</div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-700 font-medium">{formatDate(c.dueDate)}</span>
                            <div className="text-[10px] text-slate-400">{formatRelative(c.dueDate)}</div>
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/complaints/${c.id}`}>
                          <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                            <Eye size={13} className="mr-1" /> View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Bulk Status Update */}
      {isBulkStatusModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Bulk Update Status</h3>
              <button
                onClick={() => setIsBulkStatusModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              You are about to change the status of <span className="font-semibold text-slate-900">{selectedIds.length} complaints</span> to:
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">New Status</label>
              <select
                value={bulkStatusTarget}
                onChange={(e) => setBulkStatusTarget(e.target.value as ComplaintStatus)}
                className="w-full text-sm py-2 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-govblue-500"
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsBulkStatusModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={statusMutation.isPending}
                onClick={() => statusMutation.mutate()}
              >
                Apply to {selectedIds.length} Complaints
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Assignment */}
      {isBulkAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Bulk Department Assignment</h3>
              <button
                onClick={() => setIsBulkAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Assign <span className="font-semibold text-slate-900">{selectedIds.length} complaints</span> to a department and officer:
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Department</label>
                <select
                  value={bulkAssignDept}
                  onChange={(e) => {
                    setBulkAssignDept(e.target.value as Department);
                    setBulkAssignOfficer('');
                  }}
                  className="w-full text-sm py-2 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-govblue-500"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Assign Officer</label>
                <select
                  value={bulkAssignOfficer}
                  onChange={(e) => setBulkAssignOfficer(e.target.value)}
                  className="w-full text-sm py-2 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-govblue-500"
                >
                  <option value="">-- Choose Officer --</option>
                  {departmentUsers.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsBulkAssignModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
              >
                Assign {selectedIds.length} Complaints
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
