// ============================================================
// CivicSense – Mock Users
// ============================================================

import type { User } from '../types';

export const MOCK_USERS: User[] = [
  {
    id: 'u-001',
    name: 'Priya Sharma',
    email: 'priya.sharma@civicsense.gov',
    role: 'Super Admin',
    avatarInitials: 'PS',
  },
  {
    id: 'u-002',
    name: 'Rahul Mehta',
    email: 'rahul.mehta@civicsense.gov',
    role: 'Department Officer',
    department: 'Sanitation',
    avatarInitials: 'RM',
  },
  {
    id: 'u-003',
    name: 'Anjali Nair',
    email: 'anjali.nair@civicsense.gov',
    role: 'Department Officer',
    department: 'Roads & Infrastructure',
    avatarInitials: 'AN',
  },
  {
    id: 'u-004',
    name: 'Kiran Patel',
    email: 'kiran.patel@civicsense.gov',
    role: 'Department Officer',
    department: 'Water & Drainage',
    avatarInitials: 'KP',
  },
  {
    id: 'u-005',
    name: 'Suresh Kumar',
    email: 'suresh.kumar@civicsense.gov',
    role: 'Field Agent',
    department: 'Sanitation',
    avatarInitials: 'SK',
  },
  {
    id: 'u-006',
    name: 'Divya Rajan',
    email: 'divya.rajan@civicsense.gov',
    role: 'Field Agent',
    department: 'Roads & Infrastructure',
    avatarInitials: 'DR',
  },
  {
    id: 'u-007',
    name: 'Mohan Verma',
    email: 'mohan.verma@civicsense.gov',
    role: 'Field Agent',
    department: 'Electrical / Streetlights',
    avatarInitials: 'MV',
  },
  {
    id: 'u-008',
    name: 'Lakshmi Iyer',
    email: 'lakshmi.iyer@civicsense.gov',
    role: 'Department Officer',
    department: 'Electrical / Streetlights',
    avatarInitials: 'LI',
  },
  {
    id: 'u-009',
    name: 'Arjun Das',
    email: 'arjun.das@civicsense.gov',
    role: 'Field Agent',
    department: 'Water & Drainage',
    avatarInitials: 'AD',
  },
  {
    id: 'u-010',
    name: 'Sneha Pillai',
    email: 'sneha.pillai@civicsense.gov',
    role: 'Department Officer',
    department: 'Parks',
    avatarInitials: 'SP',
  },
];

// Credentials map for mock login (email → password)
export const MOCK_CREDENTIALS: Record<string, string> = {
  'priya.sharma@civicsense.gov': 'admin123',
  'rahul.mehta@civicsense.gov': 'officer123',
  'anjali.nair@civicsense.gov': 'officer123',
  'kiran.patel@civicsense.gov': 'officer123',
  'suresh.kumar@civicsense.gov': 'agent123',
  'divya.rajan@civicsense.gov': 'agent123',
  'mohan.verma@civicsense.gov': 'agent123',
  'lakshmi.iyer@civicsense.gov': 'officer123',
  'arjun.das@civicsense.gov': 'agent123',
  'sneha.pillai@civicsense.gov': 'officer123',
};
