import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Truncates a filename intelligently by showing the beginning and end
 * @param filename - The full filename
 * @param maxLength - Maximum total length (default: 40)
 * @param endChars - Number of characters to keep at the end (default: 20)
 * @returns Truncated filename with "..." in the middle
 */
export function truncateFilename(filename: string, maxLength: number = 40, endChars: number = 20): string {
  if (filename.length <= maxLength) {
    return filename;
  }

  const startChars = maxLength - endChars - 3; // 3 for "..."
  const start = filename.slice(0, startChars);
  const end = filename.slice(-endChars);

  return `${start}...${end}`;
}
