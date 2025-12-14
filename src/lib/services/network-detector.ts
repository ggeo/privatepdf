/**
 * Network Detection Service
 * Detects connection type (WiFi, cellular, ethernet) and warns on cellular
 */

export interface NetworkInfo {
  // Connection type
  type: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

  // Connection quality
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
  saveData: boolean; // User has data saver enabled

  // Status
  online: boolean;
  isCellular: boolean;
  isSlowConnection: boolean;

  // Warnings
  shouldWarnBeforeDownload: boolean;
  warnings: string[];
}

/**
 * Detect network connection type and quality
 */
export function detectNetwork(): NetworkInfo {
  const warnings: string[] = [];

  // Default values
  let type: 'wifi' | 'cellular' | 'ethernet' | 'unknown' = 'unknown';
  let effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown' = 'unknown';
  let downlink: number | undefined;
  let rtt: number | undefined;
  let saveData = false;
  let online = navigator.onLine;

  // Skip network detection in Tauri (desktop apps) - assume good connection
  // Check for Tauri using multiple methods for reliability
  const isTauri =
    (typeof window !== 'undefined' &&
      ((window as any).__TAURI__ !== undefined ||
       (window as any).__TAURI_INTERNALS__ !== undefined)) ||
    typeof (window as any).isTauri === 'function';

  if (isTauri) {
    console.log('[Network Detector] Running in Tauri - skipping cellular detection');
    return {
      type: 'ethernet',
      effectiveType: '4g',
      downlink: undefined,
      rtt: undefined,
      saveData: false,
      online,
      isCellular: false,
      isSlowConnection: false,
      shouldWarnBeforeDownload: false,
      warnings: [],
    };
  }

  // Network Information API (Chrome, Edge, Opera, some Android browsers)
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (connection) {
    // Effective connection type
    effectiveType = connection.effectiveType || 'unknown';

    // Downlink speed (Mbps)
    downlink = connection.downlink;

    // Round-trip time (ms)
    rtt = connection.rtt;

    // Save data mode
    saveData = connection.saveData || false;

    // Determine connection type from effectiveType and other hints
    if (connection.type) {
      // Some browsers provide explicit type
      const connType = connection.type.toLowerCase();
      if (connType === 'wifi') type = 'wifi';
      else if (connType === 'cellular') type = 'cellular';
      else if (connType === 'ethernet') type = 'ethernet';
    } else {
      // Infer from effectiveType and downlink
      if (effectiveType === '4g' && downlink && downlink > 10) {
        type = 'wifi'; // Likely WiFi if fast 4G
      } else if (
        effectiveType === '4g' ||
        effectiveType === '3g' ||
        effectiveType === '2g' ||
        effectiveType === 'slow-2g'
      ) {
        type = 'cellular';
      }
    }
  }

  // Determine if connection is slow
  const isSlowConnection =
    effectiveType === '2g' ||
    effectiveType === 'slow-2g' ||
    effectiveType === '3g' ||
    (downlink !== undefined && downlink < 1.5); // <1.5 Mbps

  const isCellular = type === 'cellular';

  // Generate warnings
  if (!online) {
    warnings.push('You are offline. Please connect to the internet.');
  }

  if (isCellular) {
    warnings.push(
      'You are on a cellular connection. Downloading AI models will consume significant data (up to 2GB).'
    );
  }

  if (isSlowConnection) {
    warnings.push(
      'Your connection is slow. Model downloads may take a long time.'
    );
  }

  if (saveData) {
    warnings.push(
      'Data saver mode is enabled. This may affect model downloads.'
    );
  }

  // Should warn before downloading large files
  const shouldWarnBeforeDownload = isCellular || isSlowConnection || !online;

  return {
    type,
    effectiveType,
    downlink,
    rtt,
    saveData,
    online,
    isCellular,
    isSlowConnection,
    shouldWarnBeforeDownload,
    warnings,
  };
}

/**
 * Estimate download time for a given file size
 */
export function estimateDownloadTime(
  fileSizeMB: number,
  networkInfo: NetworkInfo
): {
  estimatedSeconds: number;
  estimatedMinutes: number;
  displayTime: string;
} {
  let downloadSpeedMbps = 10; // Default: 10 Mbps

  // Use actual downlink if available
  if (networkInfo.downlink) {
    downloadSpeedMbps = networkInfo.downlink;
  } else {
    // Estimate based on effectiveType
    switch (networkInfo.effectiveType) {
      case '4g':
        downloadSpeedMbps = 10;
        break;
      case '3g':
        downloadSpeedMbps = 1.5;
        break;
      case '2g':
        downloadSpeedMbps = 0.3;
        break;
      case 'slow-2g':
        downloadSpeedMbps = 0.05;
        break;
    }
  }

  // Convert MB to Megabits: 1 MB = 8 Megabits
  const fileSizeMb = fileSizeMB * 8;

  // Calculate time in seconds
  const estimatedSeconds = fileSizeMb / downloadSpeedMbps;
  const estimatedMinutes = estimatedSeconds / 60;

  // Format display time
  let displayTime = '';
  if (estimatedSeconds < 60) {
    displayTime = `${Math.ceil(estimatedSeconds)} seconds`;
  } else if (estimatedMinutes < 60) {
    displayTime = `${Math.ceil(estimatedMinutes)} minutes`;
  } else {
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = Math.ceil(estimatedMinutes % 60);
    displayTime = `${hours}h ${mins}m`;
  }

  return {
    estimatedSeconds,
    estimatedMinutes,
    displayTime,
  };
}

/**
 * Get a user-friendly network summary
 */
export function getNetworkSummary(networkInfo: NetworkInfo): string {
  const parts: string[] = [];

  // Connection type
  parts.push(
    `Connection: ${networkInfo.type === 'unknown' ? 'Unknown' : networkInfo.type}`
  );

  // Speed
  if (networkInfo.downlink) {
    parts.push(`${networkInfo.downlink.toFixed(1)} Mbps`);
  } else {
    parts.push(networkInfo.effectiveType.toUpperCase());
  }

  // Status
  if (!networkInfo.online) {
    parts.push('(Offline)');
  } else if (networkInfo.saveData) {
    parts.push('(Data Saver On)');
  }

  return parts.join(' | ');
}

/**
 * Monitor network changes
 */
export function onNetworkChange(
  callback: (networkInfo: NetworkInfo) => void
): () => void {
  const handleChange = () => {
    const networkInfo = detectNetwork();
    callback(networkInfo);
  };

  // Listen to online/offline events
  window.addEventListener('online', handleChange);
  window.addEventListener('offline', handleChange);

  // Listen to connection changes (if supported)
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (connection) {
    connection.addEventListener('change', handleChange);
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleChange);
    window.removeEventListener('offline', handleChange);
    if (connection) {
      connection.removeEventListener('change', handleChange);
    }
  };
}

/**
 * Check if we should proceed with a large download
 * Returns warning message if user should be warned
 */
export function shouldWarnBeforeDownload(
  fileSizeMB: number,
  networkInfo: NetworkInfo
): {
  shouldWarn: boolean;
  title: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
} {
  // Offline
  if (!networkInfo.online) {
    return {
      shouldWarn: true,
      title: 'No Internet Connection',
      message:
        'You are offline. Please connect to the internet to download AI models.',
      severity: 'error',
    };
  }

  // Cellular connection
  if (networkInfo.isCellular) {
    const downloadTime = estimateDownloadTime(fileSizeMB, networkInfo);
    return {
      shouldWarn: true,
      title: 'Cellular Connection Detected',
      message: `You are on a cellular connection. Downloading ${fileSizeMB}MB will consume mobile data and take approximately ${downloadTime.displayTime}. We recommend using WiFi.`,
      severity: 'warning',
    };
  }

  // Slow connection (even on WiFi)
  if (networkInfo.isSlowConnection) {
    const downloadTime = estimateDownloadTime(fileSizeMB, networkInfo);
    return {
      shouldWarn: true,
      title: 'Slow Connection Detected',
      message: `Your connection speed is slow. Downloading ${fileSizeMB}MB may take ${downloadTime.displayTime}. Consider improving your connection.`,
      severity: 'warning',
    };
  }

  // Data saver mode
  if (networkInfo.saveData) {
    return {
      shouldWarn: true,
      title: 'Data Saver Mode Enabled',
      message: `Data saver mode is enabled. Downloading ${fileSizeMB}MB of AI models will proceed, but you may want to disable data saver for faster downloads.`,
      severity: 'info',
    };
  }

  // All good!
  return {
    shouldWarn: false,
    title: '',
    message: '',
    severity: 'info',
  };
}
