import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Calendar, Clock, AlertTriangle, CheckCircle2,
  Send, Upload, Sparkles, Copy, GitMerge, FileText, UserCheck,
  Building2, Camera, ShieldAlert, AlertCircle, ExternalLink, RefreshCw, X
} from 'lucide-react';
import {
  getComplaintById, getComplaints, updateComplaintStatus,
  assignComplaint, addEvidence, mergeComplaint, getUsers
} from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardBody, Button, Input, Select, Textarea, Spinner } from '../components/ui';
import { StatusBadge, PriorityBadge, OverdueBadge, CategoryBadge } from '../components/ui/Badge';
import { formatDate, formatDateTime, formatRelative, isOverdue } from '../lib/utils';
import { classifyText, autoRouteDepartment } from '../lib/classifier';
import { findDuplicates } from '../lib/similarity';
import { STATUS_TRANSITIONS } from '../types';
import type { ComplaintStatus, ComplaintCategory, Department, Evidence } from '../types';

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Active tab in details
  const [activeTab, setActiveTab] = useState<'timeline' | 'evidence' | 'duplicates'>('timeline');

  // Status transition state
  const [targetStatus, setTargetStatus] = useState<ComplaintStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Assignment state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignDept, setAssignDept] = useState<Department>('Sanitation');
  const [assignOfficer, setAssignOfficer] = useState('');

  // Category override
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState<ComplaintCategory>('Waste & Garbage');

  // Evidence state
  const [evidencePhase, setEvidencePhase] = useState<'before' | 'after' | 'general'>('after');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceImgUrl, setEvidenceImgUrl] = useState('');
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  // Merge modal
  const [mergeTargetPrimaryId, setMergeTargetPrimaryId] = useState('');
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Fetch current complaint
  const { data: complaint, isLoading, isError } = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => (id ? getComplaintById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });

  // Fetch all complaints for duplicate checking
  const { data: allComplaints = [] } = useQuery({
    queryKey: ['complaints'],
    queryFn: () => getComplaints(),
  });

  // Fetch users for assignment dropdown
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  // Calculate duplicate matches
  const duplicateMatches = useMemo(() => {
    if (!complaint || allComplaints.length === 0) return [];
    return findDuplicates(complaint, allComplaints);
  }, [complaint, allComplaints]);

  // AI Classification suggestion
  const aiClassification = useMemo(() => {
    if (!complaint) return null;
    return classifyText(complaint.title, complaint.description);
  }, [complaint]);

  // Department users for assign modal
  const deptOfficers = useMemo(() => {
    return users.filter((u) => u.department === assignDept);
  }, [users, assignDept]);

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ status, note }: { status: ComplaintStatus; note?: string }) => {
      if (!complaint || !user) return;
      return updateComplaintStatus(complaint.id, status, user.name, note);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setShowStatusModal(false);
      setStatusNote('');
    },
  });

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!complaint || !user) return;
      return assignComplaint(complaint.id, assignDept, assignOfficer || 'Unassigned', user.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setShowAssignModal(false);
    },
  });

  // Evidence mutation
  const evidenceMutation = useMutation({
    mutationFn: async () => {
      if (!complaint || !user) return;
      return addEvidence(complaint.id, {
        type: evidenceImgUrl ? 'image' : 'note',
        url: evidenceImgUrl || undefined,
        note: evidenceNote,
        phase: evidencePhase,
        uploadedBy: user.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
      setShowEvidenceModal(false);
      setEvidenceNote('');
      setEvidenceImgUrl('');
    },
  });

  // Merge mutation
  const mergeMutation = useMutation({
    mutationFn: async (primaryId: string) => {
      if (!complaint || !user) return;
      return mergeComplaint(complaint.id, primaryId, user.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      setShowMergeModal(false);
    },
  });

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400">
        <Spinner size="lg" />
        <p className="mt-3 text-sm font-medium">Loading complaint record...</p>
      </div>
    );
  }

  if (isError || !complaint) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle className="mx-auto text-amber-500 mb-3" size={36} />
        <h2 className="text-xl font-bold text-slate-800">Complaint Not Found</h2>
        <p className="text-sm text-slate-500 mt-1">
          Complaint "{id}" does not exist or may have been deleted.
        </p>
        <Link to="/complaints">
          <Button variant="outline" size="sm" className="mt-4">
            Back to Queue
          </Button>
        </Link>
      </div>
    );
  }

  const overdue = isOverdue(complaint.dueDate, complaint.status);
  const allowedTransitions = STATUS_TRANSITIONS[complaint.status] || [];

  // Resolution proof check
  const hasResolutionProof = complaint.evidence.some(
    (e) => e.phase === 'after' || e.type === 'image'
  );

  const handleStatusChangeClick = (status: ComplaintStatus) => {
    setTargetStatus(status);
    setStatusNote('');
    setShowStatusModal(true);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEvidenceImgUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Back button and quick actions header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/complaints"
            className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-govblue-600 bg-govblue-50 px-2 py-0.5 rounded border border-govblue-200">
                {complaint.id}
              </span>
              <StatusBadge status={complaint.status} />
              <PriorityBadge priority={complaint.priority} />
              {overdue && <OverdueBadge />}
              {complaint.duplicateOf && (
                <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                  Merged into {complaint.duplicateOf}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 leading-snug">
              {complaint.title}
            </h1>
          </div>
        </div>

        {/* Quick status transitions buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {allowedTransitions.map((nextStatus) => {
            const isResolveAction = nextStatus === 'Resolved';
            const canResolve = !isResolveAction || hasResolutionProof;

            return (
              <Button
                key={nextStatus}
                size="sm"
                variant={
                  nextStatus === 'Resolved'
                    ? 'primary'
                    : nextStatus === 'Rejected'
                    ? 'danger'
                    : 'secondary'
                }
                onClick={() => handleStatusChangeClick(nextStatus)}
              >
                Mark as {nextStatus}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Description, Location, Classifier, Tabs (Timeline/Evidence/Duplicates) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Complaint Details Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Issue Description & Context
                </span>
                <span className="text-xs text-slate-400">
                  Reported {formatRelative(complaint.reportedAt)}
                </span>
              </div>
            </CardHeader>

            <CardBody className="space-y-5 pt-4">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {complaint.description}
              </p>

              {/* Tags */}
              {complaint.tags && complaint.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {complaint.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Simulated Map / Location Box */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <MapPin size={15} className="text-rose-500" />
                    <span>{complaint.location.address}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {complaint.location.lat.toFixed(4)}, {complaint.location.lng.toFixed(4)}
                  </span>
                </div>

                {/* Simulated Visual Geo Map Canvas */}
                <div className="relative h-44 bg-slate-200 flex items-center justify-center overflow-hidden">
                  {/* Grid pattern */}
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle, #000 1px, transparent 1px)',
                      backgroundSize: '16px 16px',
                    }}
                  />
                  {/* Simulated roads */}
                  <div className="absolute w-full h-1 bg-slate-300 top-1/2 -translate-y-1/2 rotate-12" />
                  <div className="absolute h-full w-1 bg-slate-300 left-1/2 -translate-x-1/2 -rotate-12" />
                  <div className="absolute w-full h-0.5 bg-blue-300 top-2/3" />

                  {/* Pin */}
                  <div className="relative z-10 flex flex-col items-center animate-bounce">
                    <div className="bg-rose-600 text-white p-2 rounded-full shadow-lg ring-4 ring-rose-200">
                      <MapPin size={18} />
                    </div>
                  </div>

                  <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-xs px-2 py-1 rounded text-[11px] font-medium text-slate-700 shadow-xs">
                    Bengaluru Ward GIS Pin
                  </div>
                </div>
              </div>

              {/* Categorization & Classifier Box */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-govblue-600" />
                    <span className="text-xs font-bold text-govblue-900 uppercase tracking-wide">
                      AI Categorization Engine
                    </span>
                  </div>
                  {aiClassification && (
                    <span className="text-[11px] bg-white px-2 py-0.5 rounded-full font-semibold text-govblue-700 border border-blue-200 shadow-2xs">
                      {Math.round(aiClassification.confidence * 100)}% Match Confidence
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-600 leading-relaxed">
                  Rule-based NLP classifier analyzed complaint text and identified keywords for{' '}
                  <span className="font-semibold text-slate-900">{complaint.category}</span>.
                  Auto-routed to recommended department:{' '}
                  <span className="font-semibold text-govblue-800">
                    {autoRouteDepartment(complaint.category) || 'Manual Assignment'}
                  </span>.
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <CategoryBadge category={complaint.category} />
                  <button
                    onClick={() => setIsEditingCategory(!isEditingCategory)}
                    className="text-xs text-govblue-600 hover:text-govblue-800 font-medium ml-2 underline"
                  >
                    {isEditingCategory ? 'Cancel Override' : 'Override Category'}
                  </button>
                </div>

                {isEditingCategory && (
                  <div className="flex items-center gap-2 pt-2 animate-in fade-in duration-150">
                    <select
                      value={overrideCategory}
                      onChange={(e) => setOverrideCategory(e.target.value as ComplaintCategory)}
                      className="text-xs py-1.5 px-2.5 border border-slate-300 rounded-md bg-white text-slate-800"
                    >
                      <option value="Waste & Garbage">Waste & Garbage</option>
                      <option value="Roads & Potholes">Roads & Potholes</option>
                      <option value="Streetlights">Streetlights</option>
                      <option value="Water Supply">Water Supply</option>
                      <option value="Drainage">Drainage</option>
                      <option value="Parks & Recreation">Parks & Recreation</option>
                      <option value="Noise Pollution">Noise Pollution</option>
                      <option value="Other">Other</option>
                    </select>
                    <Button
                      size="sm"
                      onClick={() => {
                        complaint.category = overrideCategory;
                        setIsEditingCategory(false);
                        queryClient.invalidateQueries({ queryKey: ['complaint', id] });
                      }}
                    >
                      Save Override
                    </Button>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Interactive Tabs: Timeline, Evidence, Duplicate Detection */}
          <Card>
            <div className="border-b border-slate-200 bg-slate-50/50 px-4">
              <nav className="flex space-x-6">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`py-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'timeline'
                      ? 'border-govblue-600 text-govblue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Clock size={14} /> Audit Timeline ({complaint.timeline.length})
                </button>

                <button
                  onClick={() => setActiveTab('evidence')}
                  className={`py-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'evidence'
                      ? 'border-govblue-600 text-govblue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Camera size={14} /> Evidence & Photos ({complaint.evidence.length})
                </button>

                <button
                  onClick={() => setActiveTab('duplicates')}
                  className={`py-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'duplicates'
                      ? 'border-govblue-600 text-govblue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <GitMerge size={14} /> Possible Duplicates ({duplicateMatches.length})
                </button>
              </nav>
            </div>

            <CardBody className="p-6">
              {/* Tab 1: Audit Timeline */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                    {complaint.timeline.map((item, idx) => (
                      <div key={item.id} className="relative group">
                        {/* Dot indicator */}
                        <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-govblue-600 shadow-xs" />

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={item.status} />
                              <span className="text-xs font-semibold text-slate-700">
                                by {item.changedBy}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {formatDateTime(item.changedAt)}
                            </span>
                          </div>

                          {item.note && (
                            <p className="text-xs text-slate-600 mt-2 bg-white p-2.5 rounded border border-slate-100">
                              "{item.note}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChangeClick(complaint.status)}
                    >
                      + Add Note / Log Audit Entry
                    </Button>
                  </div>
                </div>
              )}

              {/* Tab 2: Evidence & Photos */}
              {activeTab === 'evidence' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Attached Resolution Evidence</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Before/after photos and field inspector verification notes.
                      </p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => setShowEvidenceModal(true)}
                      leftIcon={<Upload size={14} />}
                    >
                      Attach Proof
                    </Button>
                  </div>

                  {complaint.evidence.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                      <Camera size={32} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-600">No evidence attached yet</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Upload before/after photos or resolution notes to verify civic repair.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {complaint.evidence.map((ev) => (
                        <div
                          key={ev.id}
                          className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  ev.phase === 'after'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : ev.phase === 'before'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {ev.phase} Resolution Proof
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {formatDate(ev.uploadedAt)}
                              </span>
                            </div>

                            {ev.url && (
                              <div className="rounded-lg overflow-hidden border border-slate-200 mb-2.5 max-h-48 bg-slate-100 flex items-center justify-center">
                                <img
                                  src={ev.url}
                                  alt="Evidence"
                                  className="object-cover w-full h-44 hover:scale-105 transition-transform duration-200"
                                />
                              </div>
                            )}

                            {ev.note && (
                              <p className="text-xs text-slate-700 bg-white p-2.5 rounded border border-slate-100">
                                {ev.note}
                              </p>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-200 flex justify-between">
                            <span>Uploaded by {ev.uploadedBy}</span>
                            <span>{ev.type}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Possible Duplicates */}
              {activeTab === 'duplicates' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Duplicate Candidates (Jaccard + Geo + Category Similarity)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        CivicSense automatically compares token sets, haversine distance, and category to prevent duplicate work.
                      </p>
                    </div>
                  </div>

                  {duplicateMatches.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200">
                      <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No duplicate reports detected</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        This complaint appears unique in geographic vicinity and description.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {duplicateMatches.map((match) => {
                        const target = allComplaints.find((c) => c.id === match.complaintId);
                        if (!target) return null;
                        const matchPct = Math.round(match.score * 100);

                        return (
                          <div
                            key={match.complaintId}
                            className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs hover:border-govblue-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                          >
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/complaints/${target.id}`}
                                  className="font-mono text-xs font-bold text-govblue-600 hover:underline"
                                >
                                  {target.id}
                                </Link>
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                    matchPct >= 75
                                      ? 'bg-red-100 text-red-800 border border-red-200'
                                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {matchPct}% Match
                                </span>
                                <StatusBadge status={target.status} />
                              </div>

                              <h5 className="text-sm font-semibold text-slate-800 line-clamp-1">
                                {target.title}
                              </h5>

                              <p className="text-xs text-slate-500 line-clamp-1">
                                {target.description}
                              </p>

                              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-500">
                                {match.reasons.map((r, i) => (
                                  <span
                                    key={i}
                                    className="bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600"
                                  >
                                    • {r}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Link to={`/complaints/${target.id}`}>
                                <Button size="sm" variant="secondary">
                                  View Match
                                </Button>
                              </Link>

                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => {
                                  setMergeTargetPrimaryId(target.id);
                                  setShowMergeModal(true);
                                }}
                                leftIcon={<GitMerge size={13} />}
                              >
                                Merge into {target.id}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right 1 Column: Assignment, SLA details, Citizen Info, Quick Action Modals */}
        <div className="space-y-6">
          {/* Department Assignment Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Department & Routing
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAssignDept(complaint.assignedDepartment || 'Sanitation');
                    setAssignOfficer(complaint.assignedOfficer || '');
                    setShowAssignModal(true);
                  }}
                >
                  Reassign
                </Button>
              </div>
            </CardHeader>

            <CardBody className="space-y-4 pt-4">
              <div>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                  Assigned Department
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Building2 size={16} className="text-govblue-600" />
                  <span className="text-sm font-semibold text-slate-800">
                    {complaint.assignedDepartment || 'Not assigned'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                  Assigned Officer / Agent
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <UserCheck size={16} className="text-emerald-600" />
                  <span className="text-sm font-medium text-slate-800">
                    {complaint.assignedOfficer || 'No officer assigned'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                Auto-assigned based on the civic taxonomy rule:{' '}
                <span className="font-semibold text-slate-700">
                  {autoRouteDepartment(complaint.category) || 'General Triage'}
                </span>
              </div>
            </CardBody>
          </Card>

          {/* SLA & Time Metrics Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Service Level Agreement (SLA)
              </span>
            </CardHeader>

            <CardBody className="space-y-4 pt-4">
              <div>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                  Target Resolution Due Date
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-semibold text-slate-800">
                    {formatDate(complaint.dueDate)}
                  </span>
                  {overdue ? (
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      SLA Breached
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Within SLA
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {formatRelative(complaint.dueDate)}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                  Reported Date
                </span>
                <div className="text-sm font-medium text-slate-800 mt-1">
                  {formatDateTime(complaint.reportedAt)}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                  Reported By
                </span>
                <div className="text-sm font-medium text-slate-800 mt-1">
                  {complaint.reportedBy} (Citizen Portal)
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Merged duplicates link card if any */}
          {complaint.mergedComplaints && complaint.mergedComplaints.length > 0 && (
            <Card className="bg-amber-50/50 border-amber-200">
              <CardBody className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                  <GitMerge size={14} /> Merged Duplicates Linked
                </div>
                <p className="text-xs text-amber-800">
                  {complaint.mergedComplaints.length} duplicate complaints were merged into this primary record:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {complaint.mergedComplaints.map((mId) => (
                    <Link
                      key={mId}
                      to={`/complaints/${mId}`}
                      className="font-mono text-xs font-semibold bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded hover:bg-amber-100"
                    >
                      {mId}
                    </Link>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* Modal: Status Change / Transition */}
      {showStatusModal && targetStatus && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                Update Status to <span className="text-govblue-600">{targetStatus}</span>
              </h3>
              <button onClick={() => setShowStatusModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {targetStatus === 'Resolved' && !hasResolutionProof && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5" />
                <span>
                  <strong>Notice:</strong> High-integrity resolution policy recommends attaching verification photo or repair note evidence under the Evidence tab before closing this ticket.
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Audit Note / Reason for Status Change
              </label>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Enter field notes, inspection feedback, or resolution remarks..."
                rows={3}
                className="w-full text-sm p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-govblue-500 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowStatusModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    status: targetStatus,
                    note: statusNote || `Status updated to ${targetStatus}`,
                  })
                }
              >
                Confirm Status Change
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reassign Department */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Assign Department & Officer</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Target Department</label>
                <select
                  value={assignDept}
                  onChange={(e) => {
                    setAssignDept(e.target.value as Department);
                    setAssignOfficer('');
                  }}
                  className="w-full text-sm py-2 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-govblue-500"
                >
                  <option value="Sanitation">Sanitation</option>
                  <option value="Roads & Infrastructure">Roads & Infrastructure</option>
                  <option value="Electrical / Streetlights">Electrical / Streetlights</option>
                  <option value="Water & Drainage">Water & Drainage</option>
                  <option value="Parks">Parks</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Assign Officer</label>
                <select
                  value={assignOfficer}
                  onChange={(e) => setAssignOfficer(e.target.value)}
                  className="w-full text-sm py-2 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-govblue-500"
                >
                  <option value="">-- Choose Officer --</option>
                  {deptOfficers.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowAssignModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
              >
                Save Assignment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Attach Evidence */}
      {showEvidenceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Attach Evidence / Resolution Proof</h3>
              <button onClick={() => setShowEvidenceModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Phase</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['before', 'after', 'general'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEvidencePhase(p)}
                      className={`text-xs py-1.5 capitalize rounded-lg border font-medium ${
                        evidencePhase === p
                          ? 'bg-govblue-600 text-white border-govblue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Upload Photo (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileUpload}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-govblue-50 file:text-govblue-700 hover:file:bg-govblue-100"
                />
                {evidenceImgUrl && (
                  <div className="mt-2 rounded border border-slate-200 overflow-hidden max-h-32">
                    <img src={evidenceImgUrl} alt="Preview" className="h-32 w-full object-cover" />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Notes / Description</label>
                <textarea
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  placeholder="e.g. Pothole filled and rolled with asphalt; street light fixture replaced..."
                  rows={3}
                  className="w-full text-sm p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-govblue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowEvidenceModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={evidenceMutation.isPending}
                onClick={() => evidenceMutation.mutate()}
              >
                Upload Evidence
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Merge as Duplicate */}
      {showMergeModal && mergeTargetPrimaryId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Confirm Duplicate Merge</h3>
              <button onClick={() => setShowMergeModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              You are about to merge this complaint <span className="font-mono font-bold text-slate-900">{complaint.id}</span> as a duplicate of primary complaint <span className="font-mono font-bold text-govblue-600">{mergeTargetPrimaryId}</span>.
            </p>

            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-800 space-y-1">
              <p>• {complaint.id} status will be set to <strong>Duplicate</strong></p>
              <p>• A bidirectional audit record will be logged on both tickets</p>
              <p>• The primary complaint {mergeTargetPrimaryId} will track this as an allied citizen report</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowMergeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={mergeMutation.isPending}
                onClick={() => mergeMutation.mutate(mergeTargetPrimaryId)}
              >
                Confirm Merge
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
