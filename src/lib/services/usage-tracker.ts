/**
 * Usage Tracking Service
 *
 * Tracks PDF uploads locally (for stats/display purposes only)
 * Open source version - no limits
 */

import { getAllDocuments } from './indexeddb-storage';

export interface UsageStats {
  currentMonth: string; // "2024-01"
  pdfsUploadedThisMonth: number;
  totalPdfs: number;
}

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get month from timestamp
 */
function getMonthFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get usage stats for current month
 */
export async function getUsageStats(): Promise<UsageStats> {
  const currentMonth = getCurrentMonth();

  // Get all documents from IndexedDB
  const allDocs = await getAllDocuments();

  // Count documents uploaded in current month
  const pdfsThisMonth = allDocs.filter(doc => {
    const docMonth = getMonthFromTimestamp(doc.uploadedAt);
    return docMonth === currentMonth;
  }).length;

  return {
    currentMonth,
    pdfsUploadedThisMonth: pdfsThisMonth,
    totalPdfs: allDocs.length,
  };
}

/**
 * Check if user can upload more PDFs (always true - open source, no limits)
 */
export async function canUploadPDF(): Promise<{
  allowed: boolean;
  stats: UsageStats;
}> {
  const stats = await getUsageStats();

  // Open source - always allowed
  return {
    allowed: true,
    stats,
  };
}

/**
 * Track a new PDF upload (call this after successful upload)
 */
export async function trackPDFUpload(documentId: string): Promise<void> {
  // Document is already saved in IndexedDB by document-processor
  // This function is for future extensions (e.g., analytics)
  console.log(`Tracked PDF upload: ${documentId}`);
}

/**
 * Get usage display text for UI
 */
export function getUsageText(stats: UsageStats): string {
  return `${stats.pdfsUploadedThisMonth} PDFs uploaded this month (${stats.totalPdfs} total)`;
}
