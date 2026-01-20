// Local Server API Configuration (for token-less sync)
const LOCAL_SERVER_CONFIG = {
    enabled: true, // Try local server first by default
    url: 'http://localhost:3000',
    apiPath: '/api/data'
};

// GitHub API Configuration
const GITHUB_CONFIG = {
    owner: 'markvanengelen-gulo',
    repo: 'daily-board',
    branch: 'main',
    dataPath: 'data.json',
    token: localStorage.getItem('githubToken') || ''
};

// Initialize sync providers
let dropboxProvider = null;
let googleDriveProvider = null;
let googleDrivePublicProvider = null;

// Initialize providers when DOM is loaded
function initializeSyncProviders() {
    if (typeof DropboxSyncProvider !== 'undefined') {
        dropboxProvider = new DropboxSyncProvider();
    }
    if (typeof GoogleDriveSyncProvider !== 'undefined') {
        googleDriveProvider = new GoogleDriveSyncProvider();
    }
    if (typeof GoogleDrivePublicSyncProvider !== 'undefined') {
        googleDrivePublicProvider = new GoogleDrivePublicSyncProvider();
    }
}

// Sync mode state
let syncMode = 'unknown'; // 'local-server', 'dropbox', 'google-drive', 'google-drive-public', 'github', or 'local-only'

// Sync mode display constants
const SYNC_MODE_DISPLAY = {
    'local-server': {
        text: '✓ Sync: Local Server (No token needed)',
        color: '#28a745'
    },
    'dropbox': {
        text: '✓ Sync: Dropbox',
        color: '#0061FF'
    },
    'google-drive': {
        text: '✓ Sync: Google Drive',
        color: '#4285F4'
    },
    'google-drive-public': {
        text: '✓ Sync: Google Drive (Public File)',
        color: '#34A853'
    },
    'github': {
        text: '✓ Sync: GitHub API',
        color: '#007bff'
    },
    'local-only': {
        text: '⚠️ Sync: Local Only (No cross-device sync)',
        color: '#ffc107'
    },
    'unknown': {
        text: 'Sync: Detecting...',
        color: '#666'
    }
};

// Data state
let appData = {
    dateEntries: {},
    tabs: [],
    listItems: {}
};
let currentSHA = null;
let isSyncing = false;

// Fixed daily disciplines
const FIXED_DISCIPLINES = [
    'WH Breathing',
    'Yoga',
    'Pull up bar / weights',
    'Review Goals and Actions',
    'Update Finances'
];

// State management
let currentDate = new Date();
let currentTabId = null;
let listTextareaSaveTimeout = null;
let isOffline = false;
let pendingSyncQueue = [];

// WebSocket Configuration (Optional)
const WEBSOCKET_CONFIG = {
    enabled: false, // Set to true to enable WebSocket sync
    url: 'ws://localhost:3000',
    socket: null
};

// Data Retention Configuration
const DATA_RETENTION = {
    daysBack: 5,
    daysForward: 5
};

// Auto-Sync Configuration
const AUTO_SYNC_CONFIG = {
    enabled: true, // Enable automatic polling for changes
    intervalMs: 5000, // Poll every 5 seconds (5000ms) - syncs when user is active on screen
                      // Note: This is 720 requests/hour, well within GitHub's 5,000 requests/hour limit
    initialDelayMs: 5000, // Initial check delay after startup (5 seconds)
    lastSyncTime: null,
    pollTimer: null,
    isChecking: false, // Flag to prevent concurrent checks
    pausedDueToVisibility: false // Flag to track if auto-sync is paused due to page visibility
};

// Time constants for sync status display
const TIME_CONSTANTS = {
    MS_PER_MINUTE: 60000,
    MINUTES_PER_HOUR: 60
};

// Data Retention Functions

/**
 * Calculate the date range for data retention (5 days back, 5 days forward from today)
 * @returns {Object} Object with startDate and endDate
 */
function getRetentionDateRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day
    
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - DATA_RETENTION.daysBack);
    
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + DATA_RETENTION.daysForward);
    
    return {
        startDate,
        endDate,
        startDateKey: startDate.toISOString().split('T')[0],
        endDateKey: endDate.toISOString().split('T')[0]
    };
}

/**
 * Check if a date key is within the retention window
 * @param {string} dateKey - Date key in YYYY-MM-DD format
 * @returns {boolean} True if within retention window
 */
function isWithinRetentionWindow(dateKey) {
    const { startDate, endDate } = getRetentionDateRange();
    const date = new Date(dateKey + 'T00:00:00'); // Parse as local date
    return date >= startDate && date <= endDate;
}

/**
 * Clean up old date entries outside the retention window
 * Removes entries older than 5 days back and newer than 5 days forward
 * @returns {number} Number of entries removed
 */
function cleanupOldEntries() {
    if (!appData.dateEntries) {
        return 0;
    }
    
    const dateKeys = Object.keys(appData.dateEntries);
    const removedKeys = [];
    
    dateKeys.forEach(dateKey => {
        if (!isWithinRetentionWindow(dateKey)) {
            removedKeys.push(dateKey);
            delete appData.dateEntries[dateKey];
        }
    });
    
    if (removedKeys.length > 0) {
        console.log(`Data retention: Removed ${removedKeys.length} old entries:`, removedKeys);
    }
    
    return removedKeys.length;
}

/**
 * Schedule periodic cleanup of old entries
 * Runs cleanup every hour
 */
function schedulePeriodicCleanup() {
    // Run cleanup immediately on startup
    const removedCount = cleanupOldEntries();
    if (removedCount > 0) {
        // Save changes if entries were removed
        updateData('Automatic cleanup: removed old entries outside retention window');
    }
    
    // Schedule cleanup every hour (3600000 ms)
    setInterval(() => {
        const count = cleanupOldEntries();
        if (count > 0) {
            updateData('Automatic cleanup: removed old entries outside retention window');
        }
    }, 3600000); // 1 hour
}

// Auto-Sync Functions

/**
 * Start automatic polling to detect remote file changes
 * Periodically checks if the remote file has been updated by another device
 */
function startAutoSync() {
    if (!AUTO_SYNC_CONFIG.enabled) {
        console.log('[Auto-Sync] Disabled');
        return;
    }
    
    // Auto-sync works with local server or GitHub, but not in local-only mode
    if (syncMode === 'local-only') {
        console.log('[Auto-Sync] Local-only mode - auto-sync not available');
        return;
    }
    
    console.log(`[Auto-Sync] Starting automatic sync polling (interval: ${AUTO_SYNC_CONFIG.intervalMs}ms) in ${syncMode} mode`);
    
    // Clear any existing timer
    if (AUTO_SYNC_CONFIG.pollTimer) {
        clearInterval(AUTO_SYNC_CONFIG.pollTimer);
    }
    
    // Set up periodic polling
    AUTO_SYNC_CONFIG.pollTimer = setInterval(async () => {
        // Prevent concurrent executions
        if (AUTO_SYNC_CONFIG.isChecking) {
            console.log('[Auto-Sync] Previous check still in progress, skipping');
            return;
        }
        
        // Check if page is currently visible/active
        // Only perform auto-sync when user is actively viewing the page
        if (document.hidden) {
            console.log('[Auto-Sync] Page not visible, skipping poll');
            AUTO_SYNC_CONFIG.pausedDueToVisibility = true;
            // Still update the display to show time elapsed
            updateSyncStatusDisplay();
            return;
        }
        
        // Log when resuming after being paused
        if (AUTO_SYNC_CONFIG.pausedDueToVisibility) {
            console.log('[Auto-Sync] Page now visible, resuming sync');
            AUTO_SYNC_CONFIG.pausedDueToVisibility = false;
        }
        
        if (isOffline || isSyncing) {
            console.log('[Auto-Sync] Skipping poll (offline or sync in progress)');
            // Still update the display to show time elapsed
            updateSyncStatusDisplay();
            return;
        }
        
        AUTO_SYNC_CONFIG.isChecking = true;
        try {
            await checkForRemoteUpdates();
        } catch (error) {
            console.error('[Auto-Sync] Error during auto-sync:', error);
            // Log error but don't show intrusive notifications for background sync failures
            // User can check error log if needed
            logError('autoSync', error);
        } finally {
            AUTO_SYNC_CONFIG.isChecking = false;
        }
        
        // Update sync status display on every poll cycle
        updateSyncStatusDisplay();
    }, AUTO_SYNC_CONFIG.intervalMs);
    
    // Also do an initial check after a short delay
    setTimeout(() => {
        if (!isOffline && !isSyncing && !AUTO_SYNC_CONFIG.isChecking) {
            checkForRemoteUpdates();
        }
    }, AUTO_SYNC_CONFIG.initialDelayMs);
}

/**
 * Stop automatic polling
 */
function stopAutoSync() {
    if (AUTO_SYNC_CONFIG.pollTimer) {
        clearInterval(AUTO_SYNC_CONFIG.pollTimer);
        AUTO_SYNC_CONFIG.pollTimer = null;
        console.log('[Auto-Sync] Stopped automatic sync polling');
    }
}

/**
 * Check if the remote file has been updated since our last sync
 * If so, fetch the latest data and merge intelligently
 */
async function checkForRemoteUpdates() {
    try {
        // For local-server mode, we'll simply fetch and compare data
        // For GitHub mode, we use SHA-based detection
        // For cloud storage (Dropbox, Google Drive), we fetch and compare
        if (syncMode === 'local-server') {
            // For local server, fetch data and compare with current
            console.log('[Auto-Sync] Checking for updates from local server...');
            
            // Store current data for comparison
            const previousDataString = JSON.stringify(appData);
            
            await fetchDataFromLocalServer();
            
            // Check if data actually changed
            const newDataString = JSON.stringify(appData);
            if (previousDataString !== newDataString) {
                // Update UI only if data changed
                updateDateDisplay();
                loadDisciplines();
                loadTasks();
                loadTabs();
                loadCurrentTab();
                
                console.log('[Auto-Sync] Data changed - UI refreshed from local server');
            } else {
                console.log('[Auto-Sync] No changes detected from local server');
            }
        } else if (syncMode === 'dropbox' || syncMode === 'google-drive') {
            // For cloud storage, fetch data and compare with current
            console.log(`[Auto-Sync] Checking for updates from ${syncMode}...`);
            
            // Store current data for comparison
            const previousDataString = JSON.stringify(appData);
            
            // Fetch data from the appropriate provider
            if (syncMode === 'dropbox') {
                await fetchDataFromDropbox();
            } else {
                await fetchDataFromGoogleDrive();
            }
            
            // Check if data actually changed
            const newDataString = JSON.stringify(appData);
            if (previousDataString !== newDataString) {
                // Update UI only if data changed
                updateDateDisplay();
                loadDisciplines();
                loadTasks();
                loadTabs();
                loadCurrentTab();
                
                console.log(`[Auto-Sync] Data changed - UI refreshed from ${syncMode}`);
                showMessage('📥 Data synchronized from remote', 'success', 3000);
            } else {
                console.log(`[Auto-Sync] No changes detected from ${syncMode}`);
            }
        } else if (syncMode === 'github') {
            const remoteSHA = await checkRemoteSHA();
            
            // If we don't have a current SHA or remote check failed, skip
            if (!remoteSHA) {
                console.log('[Auto-Sync] Remote SHA check failed, skipping poll');
                return;
            }
            
            if (!currentSHA) {
                console.log('[Auto-Sync] No local SHA available yet, skipping poll');
                return;
            }
            
            // If SHA has changed, remote file was updated
            if (remoteSHA !== currentSHA) {
                console.log('[Auto-Sync] Remote file updated, fetching changes...');
                
                // Fetch the updated data
                await fetchDataFromGitHub();
                
                // Update UI with the latest data
                updateDateDisplay();
                loadDisciplines();
                loadTasks();
                loadTabs();
                loadCurrentTab();
                
                // Show notification
                showMessage('📥 Data synchronized from remote', 'success', 3000);
            }
        }
    } catch (error) {
        console.error('[Auto-Sync] Error checking for remote updates:', error);
    }
}

/**
 * Update the last sync timestamp
 */
function updateLastSyncTime() {
    AUTO_SYNC_CONFIG.lastSyncTime = new Date().toISOString();
    updateSyncStatusDisplay();
}

/**
 * Update the sync mode display in the UI
 */
function updateSyncModeDisplay() {
    const syncModeElement = document.getElementById('syncMode');
    if (!syncModeElement) return;
    
    const config = SYNC_MODE_DISPLAY[syncMode] || SYNC_MODE_DISPLAY['unknown'];
    syncModeElement.textContent = config.text;
    syncModeElement.style.color = config.color;
}

/**
 * Update the sync status display in the UI
 */
function updateSyncStatusDisplay() {
    const syncStatus = document.getElementById('syncStatus');
    if (!syncStatus) return;
    
    if (AUTO_SYNC_CONFIG.lastSyncTime) {
        const lastSync = new Date(AUTO_SYNC_CONFIG.lastSyncTime);
        const now = new Date();
        const diffMs = now - lastSync;
        const diffMins = Math.floor(diffMs / TIME_CONSTANTS.MS_PER_MINUTE);
        
        let timeAgo;
        if (diffMins < 1) {
            timeAgo = 'just now';
        } else if (diffMins === 1) {
            timeAgo = '1 minute ago';
        } else if (diffMins < TIME_CONSTANTS.MINUTES_PER_HOUR) {
            timeAgo = `${diffMins} minutes ago`;
        } else {
            const hours = Math.floor(diffMins / TIME_CONSTANTS.MINUTES_PER_HOUR);
            timeAgo = hours === 1 ? '1 hour ago' : `${hours} hours ago`;
        }
        
        syncStatus.textContent = `Last sync: ${timeAgo}`;
    } else {
        syncStatus.textContent = 'Last sync: Never';
    }
}

// Service Worker and Offline Support

/**
 * Register service worker for offline support
 */
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('[App] Service Worker registered:', registration);
            
            // Handle service worker updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New service worker available, reload to update
                        console.log('[App] New service worker available, reloading...');
                        if (confirm('A new version is available. Reload to update?')) {
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            window.location.reload();
                        }
                    }
                });
            });
        } catch (error) {
            console.error('[App] Service Worker registration failed:', error);
        }
    }
}

/**
 * Monitor online/offline status
 */
function setupOfflineDetection() {
    // Set initial status
    isOffline = !navigator.onLine;
    updateOnlineStatus();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
        isOffline = false;
        updateOnlineStatus();
        console.log('[App] Back online');
        showMessage('Connection restored! Syncing pending changes...', 'success');
        
        // Process pending sync queue
        processPendingSyncQueue();
    });
    
    window.addEventListener('offline', () => {
        isOffline = true;
        updateOnlineStatus();
        console.log('[App] Offline');
        showMessage('You are offline. Changes will be saved locally and synced when connection is restored.', 'error');
    });
    
    // Listen for page visibility changes to pause/resume auto-sync
    // This ensures auto-sync only runs when the user is actively viewing the page
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('[App] Page hidden, auto-sync will pause on next cycle');
        } else {
            console.log('[App] Page visible, auto-sync will resume');
            // When page becomes visible again, check for updates if enough time has passed
            // This ensures users see the latest data when they return to the tab
            // Only check if we haven't synced in the last 5 seconds to avoid excessive API calls
            if (!isOffline && !isSyncing && !AUTO_SYNC_CONFIG.isChecking && GITHUB_CONFIG.token) {
                // Only check for updates if more than 5 seconds have passed since last sync
                // This prevents excessive API calls when frequently switching tabs
                if (!AUTO_SYNC_CONFIG.lastSyncTime || (Date.now() - new Date(AUTO_SYNC_CONFIG.lastSyncTime).getTime()) > 5000) {
                    console.log('[App] Checking for updates after page became visible');
                    checkForRemoteUpdates().catch(err => {
                        console.error('[App] Error checking for updates on visibility change:', err);
                    });
                } else {
                    console.log('[App] Page became visible, but recent sync already occurred, skipping immediate check');
                }
            }
        }
    });
}

/**
 * Update UI to reflect online/offline status
 */
function updateOnlineStatus() {
    const indicator = document.getElementById('syncIndicator');
    if (indicator) {
        if (isOffline) {
            indicator.textContent = '⚠️ Offline Mode';
            indicator.style.display = 'block';
            indicator.style.background = '#ff9800';
        } else if (!indicator.textContent.includes('Loading') && !indicator.textContent.includes('Saving')) {
            indicator.style.display = 'none';
        }
    }
}

/**
 * Add operation to sync queue for offline processing
 */
function addToPendingSyncQueue(operation) {
    pendingSyncQueue.push({
        operation,
        timestamp: Date.now(),
        data: JSON.parse(JSON.stringify(appData)) // Deep copy
    });
    
    // Save queue to localStorage
    localStorage.setItem('dailyBoard_syncQueue', JSON.stringify(pendingSyncQueue));
    console.log('[App] Added to sync queue:', operation);
}

/**
 * Process pending sync queue when back online
 */
async function processPendingSyncQueue() {
    if (pendingSyncQueue.length === 0) {
        return;
    }
    
    console.log(`[App] Processing ${pendingSyncQueue.length} pending sync operations...`);
    
    // Process each queued operation
    while (pendingSyncQueue.length > 0) {
        const item = pendingSyncQueue.shift();
        try {
            // Use the most recent data (from the last queue item)
            appData = item.data;
            await updateData(item.operation);
            console.log('[App] Synced:', item.operation);
        } catch (error) {
            console.error('[App] Failed to sync queued operation:', error);
            // Re-add to queue if failed
            pendingSyncQueue.unshift(item);
            break;
        }
    }
    
    // Clear queue from localStorage if empty
    if (pendingSyncQueue.length === 0) {
        localStorage.removeItem('dailyBoard_syncQueue');
        showMessage('All pending changes synced successfully!', 'success');
    } else {
        localStorage.setItem('dailyBoard_syncQueue', JSON.stringify(pendingSyncQueue));
    }
}

/**
 * Load pending sync queue from localStorage on startup
 */
function loadPendingSyncQueue() {
    try {
        const queueData = localStorage.getItem('dailyBoard_syncQueue');
        if (queueData) {
            pendingSyncQueue = JSON.parse(queueData);
            console.log(`[App] Loaded ${pendingSyncQueue.length} pending sync operations`);
            
            if (pendingSyncQueue.length > 0 && !isOffline) {
                // Process queue if we're online
                processPendingSyncQueue();
            }
        }
    } catch (error) {
        console.error('[App] Failed to load sync queue:', error);
        pendingSyncQueue = [];
    }
}

// WebSocket Support (Optional)

/**
 * Initialize WebSocket connection for real-time sync
 * This is optional - app works without it using GitHub API
 */
function initializeWebSocket() {
    if (!WEBSOCKET_CONFIG.enabled) {
        console.log('[WebSocket] Disabled - using GitHub API for sync');
        return;
    }
    
    try {
        // Check if Socket.IO is available
        if (typeof io === 'undefined') {
            console.warn('[WebSocket] Socket.IO library not loaded. Install with: <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>');
            WEBSOCKET_CONFIG.enabled = false;
            return;
        }
        
        console.log('[WebSocket] Connecting to', WEBSOCKET_CONFIG.url);
        WEBSOCKET_CONFIG.socket = io(WEBSOCKET_CONFIG.url);
        
        // Connection established
        WEBSOCKET_CONFIG.socket.on('connected', (data) => {
            console.log('[WebSocket] Connected:', data.message);
            showMessage('Real-time sync enabled!', 'success');
            
            // Request initial data sync
            WEBSOCKET_CONFIG.socket.emit('sync:request');
        });
        
        // Receive sync response
        WEBSOCKET_CONFIG.socket.on('sync:response', (data) => {
            console.log('[WebSocket] Received data from server');
            appData = initializeDataStructure(data);
            updateDateDisplay();
            loadDisciplines();
            loadTasks();
            loadTabs();
            loadCurrentTab();
        });
        
        // Receive updates from other clients
        WEBSOCKET_CONFIG.socket.on('data:updated', (data) => {
            console.log('[WebSocket] Received update from another client');
            appData = initializeDataStructure(data);
            updateDateDisplay();
            loadDisciplines();
            loadTasks();
            loadTabs();
            loadCurrentTab();
            showMessage('Data updated from another device', 'success');
        });
        
        // Confirmation that data was saved
        WEBSOCKET_CONFIG.socket.on('data:saved', (response) => {
            console.log('[WebSocket] Data saved successfully:', response.timestamp);
        });
        
        // Error handling
        WEBSOCKET_CONFIG.socket.on('sync:error', (error) => {
            console.error('[WebSocket] Sync error:', error);
            logError('WebSocket sync', new Error(error.message));
            showError('WebSocket sync failed: ' + error.message);
        });
        
        WEBSOCKET_CONFIG.socket.on('data:error', (error) => {
            console.error('[WebSocket] Data error:', error);
            logError('WebSocket data', new Error(error.message));
            showError('WebSocket data error: ' + error.message);
        });
        
        // Connection error
        WEBSOCKET_CONFIG.socket.on('connect_error', (error) => {
            console.error('[WebSocket] Connection error:', error);
            logError('WebSocket connection', error);
            showError('WebSocket connection failed. Falling back to GitHub sync.');
            WEBSOCKET_CONFIG.enabled = false;
        });
        
        // Disconnection
        WEBSOCKET_CONFIG.socket.on('disconnect', () => {
            console.log('[WebSocket] Disconnected from server');
            showMessage('WebSocket disconnected. Using GitHub sync.', 'error');
        });
        
    } catch (error) {
        console.error('[WebSocket] Initialization failed:', error);
        logError('WebSocket init', error);
        WEBSOCKET_CONFIG.enabled = false;
    }
}

/**
 * Send data update via WebSocket
 */
function sendWebSocketUpdate(message = 'Update data') {
    if (!WEBSOCKET_CONFIG.enabled || !WEBSOCKET_CONFIG.socket || !WEBSOCKET_CONFIG.socket.connected) {
        return false;
    }
    
    console.log('[WebSocket] Sending update:', message);
    WEBSOCKET_CONFIG.socket.emit('data:update', appData);
    return true;
}

// Error Logging and Enhanced Error Handling

/**
 * Log errors to localStorage for debugging
 */
function logError(context, error, additionalInfo = {}) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        context,
        message: error.message || String(error),
        stack: error.stack,
        ...additionalInfo
    };
    
    console.error(`[Error] ${context}:`, error, additionalInfo);
    
    try {
        // Get existing error log
        const existingLog = localStorage.getItem('dailyBoard_errorLog');
        let errorArray = existingLog ? JSON.parse(existingLog) : [];
        
        // Add new error
        errorArray.push(errorLog);
        
        // Keep only last 50 errors
        if (errorArray.length > 50) {
            errorArray = errorArray.slice(-50);
        }
        
        // Save back to localStorage
        localStorage.setItem('dailyBoard_errorLog', JSON.stringify(errorArray));
    } catch (e) {
        console.error('[Error] Failed to log error to localStorage:', e);
    }
}

/**
 * Get error log from localStorage
 */
function getErrorLog() {
    try {
        const log = localStorage.getItem('dailyBoard_errorLog');
        return log ? JSON.parse(log) : [];
    } catch (e) {
        console.error('[Error] Failed to retrieve error log:', e);
        return [];
    }
}

/**
 * Clear error log
 */
function clearErrorLog() {
    localStorage.removeItem('dailyBoard_errorLog');
    console.log('[App] Error log cleared');
}

// GitHub API Functions

/**
 * Check the current SHA of data.json from GitHub
 * Used to detect if the file has been modified remotely
 * @returns {Promise<string|null>} The current SHA of the file, or null if failed
 */
async function checkRemoteSHA() {
    try {
        const metaResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataPath}`,
            {
                headers: GITHUB_CONFIG.token ? {
                    'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                } : {
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (!metaResponse.ok) {
            const errorMsg = `Failed to check remote SHA: ${metaResponse.status}`;
            console.error(errorMsg);
            logError('checkRemoteSHA', new Error(errorMsg), { status: metaResponse.status });
            return null;
        }
        
        const metaData = await metaResponse.json();
        return metaData.sha;
    } catch (error) {
        console.error('Error checking remote SHA:', error);
        logError('checkRemoteSHA', error);
        return null;
    }
}

/**
 * Create a timestamped backup of data.json in the repository
 * The backup file will be named data_backup_YYYYMMDDTHHMMSS.json
 * @returns {Promise<boolean>} True if backup was successful, false otherwise
 */
async function createBackup() {
    try {
        if (!GITHUB_CONFIG.token) {
            console.log('Cannot create backup: GitHub token not configured');
            return false;
        }
        
        // Generate timestamp for backup filename (ISO 8601 format without special chars)
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0]; // Format: YYYYMMDDTHHMMSS
        const backupPath = `data_backup_${timestamp}.json`;
        
        // Encode the current appData as base64 for GitHub API
        const jsonString = JSON.stringify(appData, null, 2);
        const bytes = new TextEncoder().encode(jsonString);
        const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
        const content = btoa(binString);
        
        // Create the backup file in the repository
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${backupPath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: `Backup data before update - ${timestamp}`,
                    content: content,
                    branch: GITHUB_CONFIG.branch
                })
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to create backup:', errorData);
            return false;
        }
        
        console.log(`Backup created successfully: ${backupPath}`);
        return true;
    } catch (error) {
        console.error('Error creating backup:', error);
        return false;
    }
}

// Data structure initialization helper
function initializeDataStructure(data) {
    if (!data) {
        data = {};
    }
    if (!data.listItems) {
        data.listItems = {};
    }
    if (!data.tabs) {
        data.tabs = [];
    }
    if (!data.dateEntries) {
        data.dateEntries = {};
    }
    return data;
}

/**
 * Check if local server is available
 * @returns {Promise<boolean>} True if local server is available
 */
async function isLocalServerAvailable() {
    if (!LOCAL_SERVER_CONFIG.enabled) {
        return false;
    }
    
    try {
        const response = await fetch(`${LOCAL_SERVER_CONFIG.url}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        return response.ok;
    } catch (error) {
        // Server not available
        return false;
    }
}

/**
 * Determine the active sync mode
 * @returns {Promise<string>} 'local-server', 'github', or 'local-only'
 */
async function determineSyncMode() {
    // Check local server first (no token needed)
    const serverAvailable = await isLocalServerAvailable();
    if (serverAvailable) {
        console.log('[Sync] Local server available - using token-free sync mode');
        return 'local-server';
    }
    
    // Check Dropbox (priority #2)
    if (dropboxProvider) {
        const dropboxAvailable = await dropboxProvider.checkAvailability();
        if (dropboxAvailable) {
            console.log('[Sync] Dropbox configured - using Dropbox sync mode');
            return 'dropbox';
        }
    }
    
    // Check Google Drive Public (priority #3 - no token needed)
    if (googleDrivePublicProvider) {
        const drivePublicAvailable = await googleDrivePublicProvider.checkAvailability();
        if (drivePublicAvailable) {
            console.log('[Sync] Google Drive Public file configured - using Google Drive Public sync mode');
            return 'google-drive-public';
        }
    }
    
    // Check Google Drive (priority #4 - requires token)
    if (googleDriveProvider) {
        const driveAvailable = await googleDriveProvider.checkAvailability();
        if (driveAvailable) {
            console.log('[Sync] Google Drive configured - using Google Drive sync mode');
            return 'google-drive';
        }
    }
    
    // Check if GitHub token is configured (priority #5)
    if (GITHUB_CONFIG.token) {
        console.log('[Sync] GitHub token configured - using GitHub API mode');
        return 'github';
    }
    
    // Fall back to local-only mode
    console.log('[Sync] No server or token - using local-only mode');
    return 'local-only';
}

/**
 * Fetch data from local server
 * @returns {Promise<Object>} The fetched data
 */
async function fetchDataFromLocalServer() {
    try {
        showSyncIndicator('loading');
        
        const response = await fetch(`${LOCAL_SERVER_CONFIG.url}${LOCAL_SERVER_CONFIG.apiPath}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch from local server: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Ensure the data structure has all required fields
        const initializedData = initializeDataStructure(data);
        
        appData = initializedData;
        hideSyncIndicator();
        return initializedData;
    } catch (error) {
        console.error('Error fetching data from local server:', error);
        hideSyncIndicator();
        showError('Failed to load data from local server. Using local fallback.');
        
        // Fallback to localStorage if local server fetch fails
        return loadFromLocalStorageFallback();
    }
}

/**
 * Update data to local server
 * @param {string} message - Commit message (not used for local server, kept for API compatibility)
 * @returns {Promise<void>}
 */
async function updateDataToLocalServer(message = 'Update data') {
    try {
        showSyncIndicator('saving');
        
        const response = await fetch(`${LOCAL_SERVER_CONFIG.url}${LOCAL_SERVER_CONFIG.apiPath}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(appData)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to update local server: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Update last sync time
        updateLastSyncTime();
        
        hideSyncIndicator();
        
        // Also save to localStorage as backup
        saveToLocalStorage();
        
        console.log('[Sync] Data saved to local server successfully');
    } catch (error) {
        console.error('Error updating data to local server:', error);
        hideSyncIndicator();
        showError('Failed to save data to local server. Changes saved locally.');
        
        // Save to localStorage as fallback
        saveToLocalStorage();
    }
}

/**
 * Fetch data from Dropbox
 * @returns {Promise<Object>} The fetched data
 */
async function fetchDataFromDropbox() {
    try {
        showSyncIndicator('loading');
        
        const data = await dropboxProvider.fetchData();
        
        // Ensure the data structure has all required fields
        const initializedData = initializeDataStructure(data);
        
        appData = initializedData;
        saveToLocalStorage(); // Save to localStorage as backup
        hideSyncIndicator();
        updateLastSyncTime();
        return initializedData;
    } catch (error) {
        console.error('Error fetching data from Dropbox:', error);
        hideSyncIndicator();
        showError('Failed to load data from Dropbox. Using local fallback.');
        
        // Fallback to localStorage if Dropbox fetch fails
        return loadFromLocalStorageFallback();
    }
}

/**
 * Update data to Dropbox
 * @param {string} message - Commit message (not used for Dropbox, kept for API compatibility)
 * @returns {Promise<void>}
 */
async function updateDataToDropbox(message = 'Update data') {
    try {
        showSyncIndicator('saving');
        
        await dropboxProvider.updateData(appData, message);
        
        hideSyncIndicator();
        updateLastSyncTime();
        
        // Save to localStorage as fallback
        saveToLocalStorage();
    } catch (error) {
        console.error('Error updating data to Dropbox:', error);
        hideSyncIndicator();
        showError('Failed to save data to Dropbox.');
        throw error;
    }
}

/**
 * Fetch data from Google Drive
 * @returns {Promise<Object>} The fetched data
 */
async function fetchDataFromGoogleDrive() {
    try {
        showSyncIndicator('loading');
        
        const data = await googleDriveProvider.fetchData();
        
        // Ensure the data structure has all required fields
        const initializedData = initializeDataStructure(data);
        
        appData = initializedData;
        saveToLocalStorage(); // Save to localStorage as backup
        hideSyncIndicator();
        updateLastSyncTime();
        return initializedData;
    } catch (error) {
        console.error('Error fetching data from Google Drive:', error);
        hideSyncIndicator();
        showError('Failed to load data from Google Drive. Using local fallback.');
        
        // Fallback to localStorage if Google Drive fetch fails
        return loadFromLocalStorageFallback();
    }
}

/**
 * Update data to Google Drive
 * @param {string} message - Commit message (not used for Google Drive, kept for API compatibility)
 * @returns {Promise<void>}
 */
async function updateDataToGoogleDrive(message = 'Update data') {
    try {
        showSyncIndicator('saving');
        
        await googleDriveProvider.updateData(appData, message);
        
        hideSyncIndicator();
        updateLastSyncTime();
        
        // Save to localStorage as fallback
        saveToLocalStorage();
    } catch (error) {
        console.error('Error updating data to Google Drive:', error);
        hideSyncIndicator();
        showError('Failed to save data to Google Drive.');
        throw error;
    }
}

/**
 * Fetch data from Google Drive Public file
 * @returns {Promise<Object>} The fetched data
 */
async function fetchDataFromGoogleDrivePublic() {
    try {
        showSyncIndicator('loading');
        
        const data = await googleDrivePublicProvider.fetchData();
        
        // Ensure the data structure has all required fields
        const initializedData = initializeDataStructure(data);
        
        appData = initializedData;
        saveToLocalStorage(); // Save to localStorage as backup
        hideSyncIndicator();
        updateLastSyncTime();
        return initializedData;
    } catch (error) {
        console.error('Error fetching data from Google Drive Public:', error);
        hideSyncIndicator();
        showError(`Failed to load data from Google Drive Public file: ${error.message}`);
        
        // Fallback to localStorage if Google Drive fetch fails
        return loadFromLocalStorageFallback();
    }
}

/**
 * Update data to Google Drive Public file
 * Note: This is a read-only provider, so this function only logs a warning
 * @param {string} message - Commit message (not used)
 * @returns {Promise<void>}
 */
async function updateDataToGoogleDrivePublic(message = 'Update data') {
    try {
        showSyncIndicator('saving');
        
        // Public Google Drive provider is read-only
        const success = await googleDrivePublicProvider.updateData(appData, message);
        
        if (!success) {
            console.warn('[Google Drive Public] Read-only mode: Data saved to localStorage only');
            showError('Google Drive Public is read-only. Changes saved locally only.');
        }
        
        hideSyncIndicator();
        updateLastSyncTime();
        
        // Always save to localStorage as this is read-only mode
        saveToLocalStorage();
    } catch (error) {
        console.error('Error in Google Drive Public update:', error);
        hideSyncIndicator();
        showError('Failed to process Google Drive Public update.');
        
        // Save to localStorage as fallback
        saveToLocalStorage();
    }
}

/**
 * Fetch data from remote source (routes to local server or GitHub based on sync mode)
 * @returns {Promise<Object>} The fetched data
 */
async function fetchData() {
    // Determine sync mode if not already set
    if (syncMode === 'unknown') {
        syncMode = await determineSyncMode();
        updateSyncModeDisplay();
    }
    
    // Route to appropriate sync method
    if (syncMode === 'local-server') {
        return await fetchDataFromLocalServer();
    } else if (syncMode === 'dropbox') {
        return await fetchDataFromDropbox();
    } else if (syncMode === 'google-drive-public') {
        return await fetchDataFromGoogleDrivePublic();
    } else if (syncMode === 'google-drive') {
        return await fetchDataFromGoogleDrive();
    } else if (syncMode === 'github') {
        return await fetchDataFromGitHub();
    } else {
        // Local-only mode - load from localStorage
        console.log('[Sync] Local-only mode - loading from localStorage');
        return loadFromLocalStorageFallback();
    }
}

/**
 * Update data to remote source (routes to local server or GitHub based on sync mode)
 * @param {string} message - Commit message
 * @returns {Promise<void>}
 */
async function updateData(message = 'Update data') {
    // Determine sync mode if not already set
    if (syncMode === 'unknown') {
        syncMode = await determineSyncMode();
        updateSyncModeDisplay();
    }
    
    // Route to appropriate sync method
    if (syncMode === 'local-server') {
        return await updateDataToLocalServer(message);
    } else if (syncMode === 'dropbox') {
        return await updateDataToDropbox(message);
    } else if (syncMode === 'google-drive-public') {
        return await updateDataToGoogleDrivePublic(message);
    } else if (syncMode === 'google-drive') {
        return await updateDataToGoogleDrive(message);
    } else if (syncMode === 'github') {
        return await updateDataToGitHub(message);
    } else {
        // Local-only mode - save to localStorage only
        console.log('[Sync] Local-only mode - saving to localStorage only');
        saveToLocalStorage();
    }
}

/**
 * Fetch data from GitHub repository
 * Uses the GitHub Contents API to get the file content directly,
 * which avoids the caching issue that occurs with raw.githubusercontent.com
 * (raw URLs can cache for up to 5 minutes, causing sync delays between devices)
 */
async function fetchDataFromGitHub() {
    try {
        showSyncIndicator('loading');
        
        // Fetch file metadata and content in one API call
        const metaResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataPath}`,
            {
                headers: GITHUB_CONFIG.token ? {
                    'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                } : {
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (!metaResponse.ok) {
            throw new Error(`Failed to fetch metadata: ${metaResponse.status}`);
        }
        
        const metaData = await metaResponse.json();
        currentSHA = metaData.sha;
        
        // Validate API response includes content
        if (!metaData.content) {
            throw new Error('No content found in API response');
        }
        
        // Decode the base64 content from the API response
        // This avoids the caching issue with raw.githubusercontent.com
        // GitHub API returns base64 with newlines; we must strip them before decoding
        let decodedContent;
        try {
            decodedContent = atob(metaData.content.replace(/\s/g, ''));
        } catch (decodeError) {
            throw new Error(`Failed to decode base64 content: ${decodeError.message}`);
        }
        
        let data;
        try {
            data = JSON.parse(decodedContent);
        } catch (parseError) {
            throw new Error(`Failed to parse JSON content: ${parseError.message}`);
        }
        
        // Ensure the data structure has all required fields
        data = initializeDataStructure(data);
        
        appData = data;
        
        hideSyncIndicator();
        return data;
    } catch (error) {
        console.error('Error fetching data from GitHub:', error);
        logError('fetchDataFromGitHub', error);
        hideSyncIndicator();
        
        // Only show error message if GitHub token is configured
        // When token is not configured, silent fallback to localStorage is expected
        if (GITHUB_CONFIG.token) {
            showError('Failed to load data from GitHub. Using local fallback.');
        } else {
            console.log('GitHub token not configured. Using local storage only.');
        }
        
        // Fallback to localStorage if GitHub fetch fails
        return loadFromLocalStorageFallback();
    }
}

async function updateDataToGitHub(message = 'Update data') {
    // If offline, queue the operation and save locally
    if (isOffline) {
        console.log('[App] Offline - queuing sync operation');
        addToPendingSyncQueue(message);
        saveToLocalStorage();
        showMessage('Offline: Changes saved locally and will sync when online', 'error');
        return;
    }
    
    if (isSyncing) {
        console.log('Sync already in progress, skipping...');
        return;
    }
    
    let httpStatus = null;
    let errorType = null;
    
    try {
        isSyncing = true;
        showSyncIndicator('saving');
        
        if (!GITHUB_CONFIG.token) {
            errorType = 'NO_TOKEN';
            throw new Error('GitHub token not configured');
        }
        
        // Check for sync conflicts: Compare stored SHA with remote SHA
        // This detects if the file was modified remotely while we were editing
        const remoteSHA = await checkRemoteSHA();
        if (remoteSHA && currentSHA && remoteSHA !== currentSHA) {
            // Conflict detected: remote file has changed since we last fetched it
            isSyncing = false;
            hideSyncIndicator();
            
            const userChoice = confirm(
                '⚠️ SYNC CONFLICT DETECTED!\n\n' +
                'The data.json file was modified remotely since you last synced.\n' +
                'Your changes may overwrite someone else\'s changes.\n\n' +
                'Click OK to fetch the latest data and merge manually.\n' +
                'Click Cancel to force save your local changes (this will overwrite remote changes).'
            );
            
            if (userChoice) {
                // User chose to fetch latest data for manual resolution
                showMessage('Fetching latest data for manual merge. Please review and save again.', 'error');
                await fetchDataFromGitHub();
                updateDateDisplay();
                loadDisciplines();
                loadTasks();
                loadTabs();
                loadCurrentTab();
                return;
            } else {
                // User chose to force save - update the currentSHA to remote SHA
                currentSHA = remoteSHA;
                showMessage('Force saving your changes. Remote changes will be overwritten.', 'error');
            }
        }
        
        // Create a timestamped backup before updating
        // This protects against data loss in case something goes wrong
        const backupSuccess = await createBackup();
        if (!backupSuccess) {
            console.warn('Failed to create backup, but continuing with update');
            // Show warning but don't block the update
            showMessage('Warning: Backup creation failed. Proceeding with update.', 'error');
        }
        
        // Fetch latest SHA before updating (in case it changed during backup creation)
        const metaResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataPath}`,
            {
                headers: {
                    'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (metaResponse.ok) {
            const metaData = await metaResponse.json();
            currentSHA = metaData.sha;
        } else {
            httpStatus = metaResponse.status;
            const errorText = await metaResponse.text();
            console.error('Failed to fetch SHA:', metaResponse.status, errorText);
            errorType = 'FETCH_SHA_FAILED';
            throw new Error(`Failed to fetch file SHA (status: ${metaResponse.status})`);
        }
        
        // Update file - properly encode UTF-8 to base64
        const jsonString = JSON.stringify(appData, null, 2);
        const bytes = new TextEncoder().encode(jsonString);
        const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
        const content = btoa(binString);
        
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataPath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: message,
                    content: content,
                    sha: currentSHA,
                    branch: GITHUB_CONFIG.branch
                })
            }
        );
        
        if (!response.ok) {
            httpStatus = response.status;
            const errorData = await response.json();
            console.error('GitHub API error details:', errorData);
            errorType = 'UPDATE_FAILED';
            const errorMsg = errorData.message || 'Unknown error';
            throw new Error(`Failed to update data (status: ${response.status}): ${errorMsg}`);
        }
        
        const result = await response.json();
        currentSHA = result.content.sha;
        
        // Update last sync time
        updateLastSyncTime();
        
        isSyncing = false;
        hideSyncIndicator();
        
        // Also save to localStorage as backup
        saveToLocalStorage();
        
        // Send WebSocket update if enabled
        sendWebSocketUpdate(message);
    } catch (error) {
        console.error('Error updating data to GitHub:', error);
        isSyncing = false;
        hideSyncIndicator();
        
        // Provide detailed error message based on error type and status code
        // Note: We don't show error messages when GitHub token is not configured,
        // as this is a valid state for offline-only usage
        let errorMessage = null;
        
        if (errorType === 'NO_TOKEN') {
            // Don't show error message when token is not configured - silent fallback to localStorage
            console.log('GitHub token not configured. Changes saved to localStorage only.');
        } else if (errorType === 'FETCH_SHA_FAILED') {
            errorMessage = 'Failed to save data to GitHub. Changes saved locally. (Unable to fetch file metadata - check token permissions)';
        } else if (httpStatus === 401) {
            errorMessage = 'Failed to save data to GitHub. Changes saved locally. (Authentication failed - check token)';
        } else if (httpStatus === 403) {
            errorMessage = 'Failed to save data to GitHub. Changes saved locally. (Access denied - check token permissions)';
        } else if (httpStatus === 404) {
            errorMessage = 'Failed to save data to GitHub. Changes saved locally. (File not found - check repository and path)';
        } else if (httpStatus === 409) {
            errorMessage = 'Failed to save data to GitHub. Changes saved locally. (Conflict - file was modified elsewhere)';
        } else if (error.message) {
            errorMessage = `Failed to save data to GitHub. Changes saved locally. (${error.message})`;
        }
        
        console.error('Detailed error:', errorMessage || 'No error message (token not configured - expected behavior)');
        logError('updateDataToGitHub', error, { errorType, httpStatus });
        
        // Only show error message if one was set (i.e., not for NO_TOKEN case)
        if (errorMessage) {
            showError(errorMessage);
        }
        
        // Save to localStorage as fallback
        saveToLocalStorage();
    }
}

function showSyncIndicator(type) {
    const indicator = document.getElementById('syncIndicator');
    if (indicator) {
        indicator.textContent = type === 'loading' ? '↓ Loading...' : '↑ Saving...';
        indicator.style.display = 'block';
    }
}

function hideSyncIndicator() {
    const indicator = document.getElementById('syncIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function showMessage(message, type = 'error', duration = 10000) {
    const messageDiv = document.getElementById('errorMessage');
    if (messageDiv) {
        messageDiv.textContent = message;
        
        // Set color based on message type
        if (type === 'success') {
            messageDiv.style.background = '#e8f5e9';
            messageDiv.style.color = '#2e7d32';
        } else {
            messageDiv.style.background = '#ffebee';
            messageDiv.style.color = '#c62828';
        }
        
        messageDiv.style.display = 'block';
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, duration);
    }
}

// Keep showError for backward compatibility
function showError(message) {
    showMessage(message, 'error');
}

// Local storage fallback functions
function loadFromLocalStorageFallback() {
    let data = {};
    
    // Try to load existing localStorage data
    const tabsData = localStorage.getItem('dailyBoard_global_tabs');
    if (tabsData) {
        try {
            data.tabs = JSON.parse(tabsData);
        } catch (e) {
            console.error('Failed to parse localStorage tabs data:', e);
        }
    }
    // Don't create default tabs here - let initialization handle it
    
    // Ensure all required fields are initialized
    return initializeDataStructure(data);
}

function saveToLocalStorage() {
    localStorage.setItem('dailyBoard_backup', JSON.stringify(appData));
}

function loadFromLocalStorage() {
    const backup = localStorage.getItem('dailyBoard_backup');
    if (backup) {
        appData = JSON.parse(backup);
    }
}


// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

async function initializeApp() {
    // Initialize sync providers
    initializeSyncProviders();
    
    // Register service worker for offline support
    registerServiceWorker();
    
    // Setup offline detection
    setupOfflineDetection();
    
    // Load pending sync queue
    loadPendingSyncQueue();
    
    // Show loading indicator
    showSyncIndicator('loading');
    
    // Try to load from localStorage backup first for immediate display
    loadFromLocalStorage();
    
    // Then fetch from remote source (local server, GitHub, or local-only)
    await fetchData();
    
    // Ensure we have at least one tab after loading from all sources
    if (!appData.tabs || appData.tabs.length === 0) {
        appData.tabs = [{ id: 'tab_' + Date.now(), name: 'My List' }];
        // Save the default tab using appropriate sync mode
        if (syncMode !== 'local-only') {
            await updateData('Initialize default tab');
        }
    }
    
    // Now refresh UI with the loaded/initialized data
    updateDateDisplay();
    loadDisciplines();
    loadTasks();
    loadTabs();
    loadCurrentTab();
    
    // Start periodic cleanup of old entries
    schedulePeriodicCleanup();
    
    // Initialize WebSocket if enabled
    initializeWebSocket();
    
    // Start auto-sync polling (includes sync status display updates)
    startAutoSync();
}

function setupEventListeners() {
    // Date navigation
    document.getElementById('prevDay').addEventListener('click', () => changeDate(-1));
    document.getElementById('nextDay').addEventListener('click', () => changeDate(1));

    // Dynamic tasks
    document.getElementById('addTaskBtn').addEventListener('click', addTask);
    document.getElementById('newTaskInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    // List textarea - auto-save on blur
    const listTextarea = document.getElementById('listTextarea');
    listTextarea.addEventListener('blur', saveListTextarea);
    listTextarea.addEventListener('input', () => {
        // Debounce auto-save on input (2 seconds after user stops typing)
        clearTimeout(listTextareaSaveTimeout);
        listTextareaSaveTimeout = setTimeout(() => saveListTextarea(), 2000);
    });

    // Add tab
    document.getElementById('addTabBtn').addEventListener('click', addTab);
    
    // Sync button
    document.getElementById('syncBtn').addEventListener('click', syncData);
    
    // Download button
    document.getElementById('downloadBtn').addEventListener('click', downloadData);
    
    // Cloud storage token configuration
    document.getElementById('saveDropboxTokenBtn').addEventListener('click', saveDropboxToken);
    document.getElementById('clearDropboxTokenBtn').addEventListener('click', clearDropboxToken);
    document.getElementById('saveGoogleDriveTokenBtn').addEventListener('click', saveGoogleDriveToken);
    document.getElementById('clearGoogleDriveTokenBtn').addEventListener('click', clearGoogleDriveToken);
    
    // GitHub token configuration
    document.getElementById('saveTokenBtn').addEventListener('click', saveGitHubToken);
    document.getElementById('clearTokenBtn').addEventListener('click', clearGitHubToken);
    
    // Error log viewer
    document.getElementById('viewErrorLogBtn').addEventListener('click', viewErrorLog);
    
    // Update token status on load
    updateTokenStatus();
}

// Date management
function changeDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    loadDisciplines();
    loadTasks();
}

function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = currentDate.toLocaleDateString('en-US', options);
}

function getDateKey() {
    return currentDate.toISOString().split('T')[0];
}

// Data access helpers
function getDateEntry(dateKey) {
    if (!appData.dateEntries[dateKey]) {
        appData.dateEntries[dateKey] = {
            disciplines: {},
            tasks: []
        };
    }
    return appData.dateEntries[dateKey];
}

function saveDateEntry(dateKey, entry) {
    appData.dateEntries[dateKey] = entry;
    updateData('Update daily data');
}

function getTabs() {
    // Don't create default tabs here - this causes sync issues
    // Default tabs should only be created during initialization if needed
    return appData.tabs || [];
}

function saveTabs(tabs) {
    appData.tabs = tabs;
    updateData('Update tabs');
}

function getListItems(tabId) {
    if (!appData.listItems[tabId]) {
        appData.listItems[tabId] = '';
    }
    return appData.listItems[tabId];
}

function saveListItems(tabId, items) {
    appData.listItems[tabId] = items;
    updateData('Update list items');
}

// Disciplines management
function loadDisciplines() {
    const activeContainer = document.getElementById('disciplinesList');
    const completedContainer = document.getElementById('completedDisciplinesList');
    const completedSection = document.getElementById('completedDisciplinesSection');
    
    activeContainer.innerHTML = '';
    completedContainer.innerHTML = '';

    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    const savedDisciplines = dateEntry.disciplines || {};

    // Separate active and completed disciplines
    const activeDisciplines = [];
    const completedDisciplines = [];

    FIXED_DISCIPLINES.forEach((discipline, index) => {
        const isCompleted = savedDisciplines[index] || false;
        if (isCompleted) {
            completedDisciplines.push({ discipline, index, isCompleted });
        } else {
            activeDisciplines.push({ discipline, index, isCompleted });
        }
    });

    // Render active disciplines
    activeDisciplines.forEach(({ discipline, index, isCompleted }) => {
        const disciplineElement = createDisciplineElement(discipline, index, isCompleted);
        activeContainer.appendChild(disciplineElement);
    });

    // Render completed disciplines
    completedDisciplines.forEach(({ discipline, index, isCompleted }) => {
        const disciplineElement = createDisciplineElement(discipline, index, isCompleted);
        completedContainer.appendChild(disciplineElement);
    });

    // Show/hide completed section
    completedSection.style.display = completedDisciplines.length > 0 ? 'block' : 'none';
}

function createDisciplineElement(name, index, isCompleted) {
    const div = document.createElement('div');
    div.className = 'discipline-item';

    const leftDiv = document.createElement('div');
    leftDiv.className = 'item-left';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = isCompleted;
    checkbox.addEventListener('change', () => toggleDiscipline(index, checkbox.checked));

    const label = document.createElement('span');
    label.className = 'item-label' + (isCompleted ? ' completed' : '');
    label.textContent = name;

    leftDiv.appendChild(checkbox);
    leftDiv.appendChild(label);
    
    // Add action buttons for disciplines
    const rightDiv = document.createElement('div');
    rightDiv.className = 'task-actions';
    
    const priorityBtn = document.createElement('button');
    priorityBtn.className = 'priority-btn';
    priorityBtn.innerHTML = '<span aria-hidden="true">🔴</span>';
    priorityBtn.setAttribute('aria-label', 'Mark for focus');
    priorityBtn.title = 'Click to mark this discipline for focus';
    priorityBtn.addEventListener('click', () => toggleDisciplinePriority(index));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.setAttribute('aria-label', 'Delete discipline');
    deleteBtn.title = 'Remove discipline for today';
    deleteBtn.addEventListener('click', () => deleteDiscipline(index));

    rightDiv.appendChild(priorityBtn);
    rightDiv.appendChild(deleteBtn);
    div.appendChild(leftDiv);
    div.appendChild(rightDiv);

    return div;
}

function toggleDiscipline(index, isCompleted) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    dateEntry.disciplines[index] = isCompleted;
    saveDateEntry(dateKey, dateEntry);
    loadDisciplines();
}

function toggleDisciplinePriority(index) {
    // Show an informational message about the discipline focus feature
    showMessage('🔴 Focus marker clicked! Use this to visually identify disciplines you want to prioritize today.', 'success');
}

function deleteDiscipline(index) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    // Remove the discipline completion status for today
    delete dateEntry.disciplines[index];
    saveDateEntry(dateKey, dateEntry);
    loadDisciplines();
}

// Tasks management
function loadTasks() {
    const activeContainer = document.getElementById('tasksList');
    const completedContainer = document.getElementById('completedTasksList');
    const completedSection = document.getElementById('completedTasksSection');
    
    activeContainer.innerHTML = '';
    completedContainer.innerHTML = '';

    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    let tasks = dateEntry.tasks || [];
    
    // Separate active and completed tasks
    const activeTasks = [];
    const completedTasks = [];
    
    tasks.forEach((task, index) => {
        if (task.completed) {
            completedTasks.push({ task, index });
        } else {
            activeTasks.push({ task, index });
        }
    });
    
    // Sort active tasks by priority (priority tasks first)
    activeTasks.sort((a, b) => {
        return (b.task.priority ? 1 : 0) - (a.task.priority ? 1 : 0);
    });
    
    // Render active tasks
    activeTasks.forEach(({ task, index }) => {
        const taskElement = createTaskElement(task, index);
        activeContainer.appendChild(taskElement);
    });
    
    // Render completed tasks
    completedTasks.forEach(({ task, index }) => {
        const taskElement = createTaskElement(task, index);
        completedContainer.appendChild(taskElement);
    });
    
    // Show/hide completed section
    completedSection.style.display = completedTasks.length > 0 ? 'block' : 'none';
}

function createTaskElement(task, index) {
    const div = document.createElement('div');
    div.className = 'task-item' + (task.priority ? ' priority-task' : '');
    div.draggable = true;
    div.dataset.taskIndex = index;

    const leftDiv = document.createElement('div');
    leftDiv.className = 'item-left';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => toggleTask(index, checkbox.checked));

    const label = document.createElement('span');
    label.className = 'item-label' + (task.completed ? ' completed' : '');
    label.textContent = task.name;

    leftDiv.appendChild(checkbox);
    leftDiv.appendChild(label);
    
    const rightDiv = document.createElement('div');
    rightDiv.className = 'task-actions';
    
    const backBtn = document.createElement('button');
    backBtn.className = 'date-shift-btn';
    backBtn.innerHTML = '&lt;';
    backBtn.setAttribute('aria-label', 'Move task to previous day');
    backBtn.title = 'Move to previous day';
    backBtn.addEventListener('click', () => shiftTaskDate(index, -1));

    const forwardBtn = document.createElement('button');
    forwardBtn.className = 'date-shift-btn';
    forwardBtn.innerHTML = '&gt;';
    forwardBtn.setAttribute('aria-label', 'Move task to next day');
    forwardBtn.title = 'Move to next day';
    forwardBtn.addEventListener('click', () => shiftTaskDate(index, 1));
    
    const priorityBtn = document.createElement('button');
    priorityBtn.className = 'priority-btn' + (task.priority ? ' active' : '');
    priorityBtn.innerHTML = '<span aria-hidden="true">🔴</span>';
    priorityBtn.setAttribute('aria-label', task.priority ? 'Remove from focus' : 'Mark for focus');
    priorityBtn.title = task.priority ? 'Remove from focus' : 'Mark for focus';
    priorityBtn.addEventListener('click', () => toggleTaskPriority(index));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.setAttribute('aria-label', 'Delete task');
    deleteBtn.title = 'Delete task';
    deleteBtn.addEventListener('click', () => deleteTask(index));

    rightDiv.appendChild(backBtn);
    rightDiv.appendChild(forwardBtn);
    rightDiv.appendChild(priorityBtn);
    rightDiv.appendChild(deleteBtn);
    div.appendChild(leftDiv);
    div.appendChild(rightDiv);
    
    // Drag and drop event listeners
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);

    return div;
}

function addTask() {
    const input = document.getElementById('newTaskInput');
    const taskName = input.value.trim();

    if (!taskName) return;

    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    dateEntry.tasks.push({ name: taskName, completed: false });
    saveDateEntry(dateKey, dateEntry);

    input.value = '';
    loadTasks();
}

function toggleTask(index, isCompleted) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    if (dateEntry.tasks[index]) {
        dateEntry.tasks[index].completed = isCompleted;
        saveDateEntry(dateKey, dateEntry);
        loadTasks();
    }
}

function deleteTask(index) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    dateEntry.tasks.splice(index, 1);
    saveDateEntry(dateKey, dateEntry);
    loadTasks();
}

function toggleTaskPriority(index) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    const task = dateEntry.tasks[index];
    
    if (!task) return;
    
    // If trying to mark as priority, check if we already have 3 priority tasks
    if (!task.priority) {
        const priorityCount = dateEntry.tasks.filter(t => t.priority).length;
        if (priorityCount >= 3) {
            showError('You can only have 3 priority tasks at a time. Remove one first.');
            return;
        }
    }
    
    // Toggle priority
    task.priority = !task.priority;
    saveDateEntry(dateKey, dateEntry);
    loadTasks();
}

function shiftTaskDate(index, direction) {
    const sourceDateKey = getDateKey();
    const sourceDateEntry = getDateEntry(sourceDateKey);
    const task = sourceDateEntry.tasks[index];
    
    if (!task) return;
    
    // Calculate target date - create a proper copy to avoid mutations
    const targetDate = new Date(currentDate.getTime());
    targetDate.setDate(targetDate.getDate() + direction);
    const targetDateKey = targetDate.toISOString().split('T')[0];
    
    // Get or create target date entry
    const targetDateEntry = getDateEntry(targetDateKey);
    
    // Move task to target date and remove from source date
    targetDateEntry.tasks.push({ ...task });
    sourceDateEntry.tasks.splice(index, 1);
    
    // Update both date entries in appData
    appData.dateEntries[targetDateKey] = targetDateEntry;
    appData.dateEntries[sourceDateKey] = sourceDateEntry;
    
    // Save to remote storage once with both changes
    updateData('Move task between dates');
    
    // Reload tasks for current view
    loadTasks();
}

// Tabs/Lists management
function loadTabs() {
    const container = document.getElementById('tabsContainer');
    container.innerHTML = '';

    let tabs = getTabs();

    // Set current tab if not set
    if (!currentTabId && tabs.length > 0) {
        currentTabId = tabs[0].id;
    }

    tabs.forEach((tab) => {
        const tabElement = createTabElement(tab);
        container.appendChild(tabElement);
    });
}

function createTabElement(tab) {
    const button = document.createElement('button');
    button.className = 'tab' + (tab.id === currentTabId ? ' active' : '');
    button.draggable = true;
    button.dataset.tabId = tab.id;
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = tab.name;
    nameSpan.className = 'tab-name';
    button.appendChild(nameSpan);

    // Add edit button
    const editBtn = document.createElement('span');
    editBtn.className = 'tab-edit-btn';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', 'Edit ' + tab.name);
    editBtn.setAttribute('role', 'button');
    editBtn.setAttribute('tabindex', '0');
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editTabName(tab.id, button);
    });
    button.appendChild(editBtn);

    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'tab-delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.setAttribute('aria-label', 'Delete ' + tab.name);
    deleteBtn.setAttribute('role', 'button');
    deleteBtn.setAttribute('tabindex', '0');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTab(tab.id);
    });

    button.appendChild(deleteBtn);
    button.addEventListener('click', () => switchTab(tab.id));
    
    // Add drag and drop event listeners
    button.addEventListener('dragstart', handleTabDragStart);
    button.addEventListener('dragover', handleTabDragOver);
    button.addEventListener('drop', handleTabDrop);
    button.addEventListener('dragend', handleTabDragEnd);

    return button;
}

function addTab() {
    const tabs = getTabs();
    const tabNumber = tabs.length + 1;
    const newTab = {
        id: 'tab_' + Date.now(),
        name: `List ${tabNumber}`
    };

    tabs.push(newTab);
    saveTabs(tabs);

    currentTabId = newTab.id;
    loadTabs();
    loadCurrentTab();
}

function editTabName(tabId, buttonElement) {
    const tabs = getTabs();
    const tab = tabs.find(t => t.id === tabId);
    
    if (!tab) return;
    
    const nameSpan = buttonElement.querySelector('.tab-name');
    const currentName = tab.name;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'tab-name-input';
    
    // Replace span with input
    nameSpan.replaceWith(input);
    input.focus();
    input.select();
    
    let isCancelled = false;
    
    // Save on blur or enter
    const saveEdit = () => {
        if (isCancelled) return;
        
        const newName = input.value.trim();
        if (newName && newName !== currentName) {
            tab.name = newName;
            saveTabs(tabs);
        }
        loadTabs();
    };
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            input.blur(); // This will trigger saveEdit via blur event
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            isCancelled = true;
            loadTabs(); // Cancel editing and restore original
        }
    });
    
    // Stop propagation to prevent tab switching
    input.addEventListener('click', (e) => e.stopPropagation());
}

function deleteTab(tabId) {
    let tabs = getTabs();
    
    if (tabs.length <= 1) {
        showError('You must have at least one list!');
        return;
    }

    tabs = tabs.filter(tab => tab.id !== tabId);
    saveTabs(tabs);

    // Clear items for this tab
    delete appData.listItems[tabId];
    updateData('Delete tab');

    // Switch to first tab if current tab was deleted
    if (currentTabId === tabId) {
        currentTabId = tabs[0].id;
    }

    loadTabs();
    loadCurrentTab();
}

function switchTab(tabId) {
    currentTabId = tabId;
    loadTabs();
    loadCurrentTab();
}

function loadCurrentTab() {
    const textarea = document.getElementById('listTextarea');
    
    if (!currentTabId) {
        textarea.value = '';
        return;
    }

    const items = getListItems(currentTabId);
    textarea.value = items;
}

function saveListTextarea() {
    if (!currentTabId) return;
    
    const textarea = document.getElementById('listTextarea');
    const content = textarea.value;
    saveListItems(currentTabId, content);
}

// Sync data to data.json
async function syncData() {
    try {
        // Check sync mode - only local-only mode doesn't support manual sync
        if (syncMode === 'local-only') {
            showError('No sync configured. Please start the local server or configure a GitHub token to enable sync.');
            return;
        }
        
        // Trigger sync to remote storage (saves to data.json)
        await updateData('Manual sync: Save data to data.json');
        
        // Show success message
        showMessage('✓ Data synced successfully to data.json!', 'success', 3000);
    } catch (error) {
        console.error('Error syncing data:', error);
        logError('syncData', error);
        showError('Failed to sync data. Please check your connection and try again.');
    }
}

// Download data as JSON file
function downloadData() {
    try {
        // Create a formatted JSON string of all app data
        const dataStr = JSON.stringify(appData, null, 2);
        
        // Create a blob from the JSON string
        const blob = new Blob([dataStr], { type: 'application/json' });
        
        // Create a temporary download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Use current date for filename
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0];
        link.download = `daily-board-export-${timestamp}.json`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showMessage('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Error downloading data:', error);
        showError('Failed to download data. Please try again.');
    }
}

// GitHub Token Configuration Functions
function updateTokenStatus() {
    // Update GitHub status
    const statusText = document.getElementById('tokenStatusText');
    const tokenInput = document.getElementById('githubTokenInput');
    
    if (GITHUB_CONFIG.token) {
        statusText.textContent = '✓ Configured';
        statusText.style.color = '#51cf66';
        tokenInput.placeholder = 'Token is configured (enter new token to update)';
    } else {
        statusText.textContent = '✗ Not configured';
        statusText.style.color = '#ff6b6b';
        tokenInput.placeholder = 'Enter your GitHub Personal Access Token';
    }
    
    // Update Dropbox status
    const dropboxStatusText = document.getElementById('dropboxStatusText');
    const dropboxTokenInput = document.getElementById('dropboxTokenInput');
    const dropboxToken = localStorage.getItem('dropboxToken');
    
    if (dropboxToken) {
        dropboxStatusText.textContent = '✓ Configured';
        dropboxStatusText.style.color = '#51cf66';
        dropboxTokenInput.placeholder = 'Token is configured (enter new token to update)';
    } else {
        dropboxStatusText.textContent = '✗ Not configured';
        dropboxStatusText.style.color = '#ff6b6b';
        dropboxTokenInput.placeholder = 'Enter your Dropbox Access Token';
    }
    
    // Update Google Drive status
    const googleDriveStatusText = document.getElementById('googleDriveStatusText');
    const googleDriveTokenInput = document.getElementById('googleDriveTokenInput');
    const googleDriveToken = localStorage.getItem('googleDriveToken');
    
    if (googleDriveToken) {
        googleDriveStatusText.textContent = '✓ Configured';
        googleDriveStatusText.style.color = '#51cf66';
        googleDriveTokenInput.placeholder = 'Token is configured (enter new token to update)';
    } else {
        googleDriveStatusText.textContent = '✗ Not configured';
        googleDriveStatusText.style.color = '#ff6b6b';
        googleDriveTokenInput.placeholder = 'Enter your Google Drive Access Token';
    }
}

// Dropbox token management functions
function saveDropboxToken() {
    const tokenInput = document.getElementById('dropboxTokenInput');
    const token = tokenInput.value.trim();
    
    if (!token) {
        showError('Please enter a valid Dropbox token');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('dropboxToken', token);
    
    // Re-initialize the Dropbox provider
    if (dropboxProvider) {
        dropboxProvider.config.accessToken = token;
    }
    
    // Clear the input
    tokenInput.value = '';
    
    // Update status
    updateTokenStatus();
    
    // Re-determine sync mode
    syncMode = 'unknown';
    determineSyncMode().then((mode) => {
        syncMode = mode;
        updateSyncModeDisplay();
        
        // Show success message
        showMessage('Dropbox token saved successfully! The app will now sync with Dropbox.', 'success');
        
        // Close the config section
        const configDetails = document.getElementById('configDetails');
        if (configDetails) {
            configDetails.removeAttribute('open');
        }
        
        // Fetch data from Dropbox with new token
        fetchData().then(() => {
            updateDateDisplay();
            loadDisciplines();
            loadTasks();
            loadTabs();
            loadCurrentTab();
            
            // Restart auto-sync with new mode
            stopAutoSync();
            startAutoSync();
        });
    });
}

function clearDropboxToken() {
    if (!confirm('Are you sure you want to clear the Dropbox token? The app will switch to another sync mode.')) {
        return;
    }
    
    // Remove from localStorage
    localStorage.removeItem('dropboxToken');
    
    // Update the provider
    if (dropboxProvider) {
        dropboxProvider.config.accessToken = '';
    }
    
    // Update status
    updateTokenStatus();
    
    // Re-determine sync mode
    syncMode = 'unknown';
    determineSyncMode().then((mode) => {
        syncMode = mode;
        updateSyncModeDisplay();
        
        // Show message based on new sync mode
        let message = 'Dropbox token cleared. ';
        if (syncMode === 'local-server') {
            message += 'The app will now sync with local server.';
        } else if (syncMode === 'google-drive') {
            message += 'The app will now sync with Google Drive.';
        } else if (syncMode === 'github') {
            message += 'The app will now sync with GitHub.';
        } else {
            message += 'The app will now only save data locally.';
        }
        showMessage(message, 'success');
        
        // Restart auto-sync with new mode
        stopAutoSync();
        startAutoSync();
    });
}

// Google Drive token management functions
function saveGoogleDriveToken() {
    const tokenInput = document.getElementById('googleDriveTokenInput');
    const token = tokenInput.value.trim();
    
    if (!token) {
        showError('Please enter a valid Google Drive token');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('googleDriveToken', token);
    
    // Re-initialize the Google Drive provider
    if (googleDriveProvider) {
        googleDriveProvider.config.accessToken = token;
    }
    
    // Clear the input
    tokenInput.value = '';
    
    // Update status
    updateTokenStatus();
    
    // Re-determine sync mode
    syncMode = 'unknown';
    determineSyncMode().then((mode) => {
        syncMode = mode;
        updateSyncModeDisplay();
        
        // Show success message
        showMessage('Google Drive token saved successfully! The app will now sync with Google Drive.', 'success');
        
        // Close the config section
        const configDetails = document.getElementById('configDetails');
        if (configDetails) {
            configDetails.removeAttribute('open');
        }
        
        // Fetch data from Google Drive with new token
        fetchData().then(() => {
            updateDateDisplay();
            loadDisciplines();
            loadTasks();
            loadTabs();
            loadCurrentTab();
            
            // Restart auto-sync with new mode
            stopAutoSync();
            startAutoSync();
        });
    });
}

function clearGoogleDriveToken() {
    if (!confirm('Are you sure you want to clear the Google Drive token? The app will switch to another sync mode.')) {
        return;
    }
    
    // Remove from localStorage
    localStorage.removeItem('googleDriveToken');
    
    // Update the provider
    if (googleDriveProvider) {
        googleDriveProvider.config.accessToken = '';
    }
    
    // Update status
    updateTokenStatus();
    
    // Re-determine sync mode
    syncMode = 'unknown';
    determineSyncMode().then((mode) => {
        syncMode = mode;
        updateSyncModeDisplay();
        
        // Show message based on new sync mode
        let message = 'Google Drive token cleared. ';
        if (syncMode === 'local-server') {
            message += 'The app will now sync with local server.';
        } else if (syncMode === 'dropbox') {
            message += 'The app will now sync with Dropbox.';
        } else if (syncMode === 'github') {
            message += 'The app will now sync with GitHub.';
        } else {
            message += 'The app will now only save data locally.';
        }
        showMessage(message, 'success');
        
        // Restart auto-sync with new mode
        stopAutoSync();
        startAutoSync();
    });
}

function saveGitHubToken() {
    const tokenInput = document.getElementById('githubTokenInput');
    const token = tokenInput.value.trim();
    
    if (!token) {
        showError('Please enter a valid GitHub token');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('githubToken', token);
    
    // Update the config
    GITHUB_CONFIG.token = token;
    
    // Clear the input
    tokenInput.value = '';
    
    // Update status
    updateTokenStatus();
    
    // Re-determine sync mode (token added, so may switch to GitHub mode)
    syncMode = 'unknown';
    determineSyncMode().then((mode) => {
        syncMode = mode;
        updateSyncModeDisplay();
        
        // Show success message
        showMessage('GitHub token saved successfully! The app will now sync with GitHub.', 'success');
        
        // Close the config section
        const configDetails = document.getElementById('configDetails');
        if (configDetails) {
            configDetails.removeAttribute('open');
        }
        
        // Fetch data from GitHub with new token
        fetchData().then(() => {
            updateDateDisplay();
            loadDisciplines();
            loadTasks();
            loadTabs();
            loadCurrentTab();
            
            // Restart auto-sync with new mode
            stopAutoSync();
            startAutoSync();
        });
    });
}

function clearGitHubToken() {
    if (!confirm('Are you sure you want to clear the GitHub token? The app will switch to local server or local-only mode.')) {
        return;
    }
    
    // Remove from localStorage
    localStorage.removeItem('githubToken');
    
    // Update the config
    GITHUB_CONFIG.token = '';
    
    // Update status
    updateTokenStatus();
    
    // Re-determine sync mode (token removed, so may switch to local-server or local-only)
    syncMode = 'unknown';
    determineSyncMode().then((mode) => {
        syncMode = mode;
        updateSyncModeDisplay();
        
        // Show message based on new sync mode
        let message = 'GitHub token cleared. ';
        if (syncMode === 'local-server') {
            message += 'The app will now sync with local server.';
        } else {
            message += 'The app will now only save data locally.';
        }
        showMessage(message, 'success');
        
        // Restart auto-sync with new mode
        stopAutoSync();
        startAutoSync();
    });
}

// Drag and Drop functionality for tasks
let draggedTaskElement = null;
let draggedTaskIndex = null;

function isTaskItem(element) {
    return element.classList.contains('task-item');
}

function handleDragStart(e) {
    draggedTaskElement = e.currentTarget;
    draggedTaskIndex = parseInt(draggedTaskElement.dataset.taskIndex);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleDragOver(e) {
    e.preventDefault();
    
    const targetElement = e.currentTarget;
    
    // Only allow dropping on task items
    if (!isTaskItem(targetElement)) {
        return false;
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    // Add visual feedback
    if (targetElement !== draggedTaskElement) {
        targetElement.classList.add('drag-over');
    }
    
    return false;
}

function handleDrop(e) {
    e.stopPropagation();
    
    const targetElement = e.currentTarget;
    
    // Only allow dropping on task items
    if (!isTaskItem(targetElement)) {
        return false;
    }
    
    if (draggedTaskElement !== targetElement) {
        const targetTaskIndex = parseInt(targetElement.dataset.taskIndex);
        
        // Reorder tasks in data
        const dateKey = getDateKey();
        const dateEntry = getDateEntry(dateKey);
        const tasks = dateEntry.tasks;
        
        // Remove dragged task and insert at new position
        const draggedTask = tasks[draggedTaskIndex];
        tasks.splice(draggedTaskIndex, 1);
        
        // When dragging downward, we need to adjust the target index by -1
        // because removing the dragged item shifts all subsequent indices down by 1
        const adjustedTargetIndex = targetTaskIndex > draggedTaskIndex ? targetTaskIndex - 1 : targetTaskIndex;
        tasks.splice(adjustedTargetIndex, 0, draggedTask);
        
        saveDateEntry(dateKey, dateEntry);
        loadTasks();
    }
    
    // Remove visual feedback
    targetElement.classList.remove('drag-over');
    
    return false;
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    
    // Remove all visual feedback
    const allTaskItems = document.querySelectorAll('.task-item');
    allTaskItems.forEach(item => {
        item.classList.remove('drag-over');
    });
    
    draggedTaskElement = null;
    draggedTaskIndex = null;
}

// Drag and Drop functionality for tabs/lists
let draggedTabElement = null;
let draggedTabId = null;

function isTabElement(element) {
    return element.classList.contains('tab');
}

function handleTabDragStart(e) {
    draggedTabElement = e.currentTarget;
    draggedTabId = draggedTabElement.dataset.tabId;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleTabDragOver(e) {
    e.preventDefault();
    
    const targetElement = e.currentTarget;
    
    // Only allow dropping on tab elements
    if (!isTabElement(targetElement)) {
        return false;
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    // Add visual feedback
    if (targetElement !== draggedTabElement) {
        targetElement.classList.add('drag-over');
    }
    
    return false;
}

function handleTabDrop(e) {
    e.stopPropagation();
    
    const targetElement = e.currentTarget;
    
    // Only allow dropping on tab elements
    if (!isTabElement(targetElement)) {
        return false;
    }
    
    if (draggedTabElement !== targetElement) {
        const targetTabId = targetElement.dataset.tabId;
        
        // Reorder tabs in data
        let tabs = getTabs();
        
        // Find indices
        const draggedIndex = tabs.findIndex(tab => tab.id === draggedTabId);
        const targetIndex = tabs.findIndex(tab => tab.id === targetTabId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            // Remove dragged tab and insert at new position
            const draggedTab = tabs[draggedIndex];
            tabs.splice(draggedIndex, 1);
            
            // Adjust target index if dragging downward
            const adjustedTargetIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
            tabs.splice(adjustedTargetIndex, 0, draggedTab);
            
            saveTabs(tabs);
            loadTabs();
        }
    }
    
    // Remove visual feedback
    targetElement.classList.remove('drag-over');
    
    return false;
}

function handleTabDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    
    // Remove all visual feedback
    const allTabs = document.querySelectorAll('.tab');
    allTabs.forEach(tab => {
        tab.classList.remove('drag-over');
    });
    
    draggedTabElement = null;
    draggedTabId = null;
}

// Error Log Viewer
function viewErrorLog() {
    const errorLog = getErrorLog();
    
    if (errorLog.length === 0) {
        alert('No errors logged. The app is running smoothly! 🎉');
        return;
    }
    
    let logMessage = `Error Log (${errorLog.length} entries):\n\n`;
    
    // Show last 10 errors
    const recentErrors = errorLog.slice(-10);
    recentErrors.forEach((error, index) => {
        logMessage += `${index + 1}. [${error.timestamp}] ${error.context}\n`;
        logMessage += `   Message: ${error.message}\n`;
        if (error.status) {
            logMessage += `   Status: ${error.status}\n`;
        }
        logMessage += '\n';
    });
    
    logMessage += '\nWould you like to clear the error log?';
    
    if (confirm(logMessage)) {
        clearErrorLog();
        showMessage('Error log cleared successfully!', 'success');
    }
}
