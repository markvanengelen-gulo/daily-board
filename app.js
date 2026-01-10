// GitHub API Configuration
const GITHUB_CONFIG = {
    owner: 'markvanengelen-gulo',
    repo: 'daily-board',
    branch: 'main',
    dataPath: 'data.json',
    token: localStorage.getItem('githubToken') || ''
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

// Data Retention Configuration
const DATA_RETENTION = {
    daysBack: 5,
    daysForward: 5
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
        updateDataToGitHub('Automatic cleanup: removed old entries outside retention window');
    }
    
    // Schedule cleanup every hour (3600000 ms)
    setInterval(() => {
        const count = cleanupOldEntries();
        if (count > 0) {
            updateDataToGitHub('Automatic cleanup: removed old entries outside retention window');
        }
    }, 3600000); // 1 hour
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
            await updateDataToGitHub(item.operation);
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
        showError('Failed to load data from GitHub. Using local fallback.');
        
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
        
        isSyncing = false;
        hideSyncIndicator();
        
        // Also save to localStorage as backup
        saveToLocalStorage();
    } catch (error) {
        console.error('Error updating data to GitHub:', error);
        isSyncing = false;
        hideSyncIndicator();
        
        // Provide detailed error message based on error type and status code
        let errorMessage = 'Failed to save data to GitHub. Changes saved locally.';
        
        if (errorType === 'NO_TOKEN') {
            errorMessage += ' (GitHub token not configured)';
        } else if (errorType === 'FETCH_SHA_FAILED') {
            errorMessage += ' (Unable to fetch file metadata - check token permissions)';
        } else if (httpStatus === 401) {
            errorMessage += ' (Authentication failed - check token)';
        } else if (httpStatus === 403) {
            errorMessage += ' (Access denied - check token permissions)';
        } else if (httpStatus === 404) {
            errorMessage += ' (File not found - check repository and path)';
        } else if (httpStatus === 409) {
            errorMessage += ' (Conflict - file was modified elsewhere)';
        } else if (error.message) {
            errorMessage += ` (${error.message})`;
        }
        
        console.error('Detailed error:', errorMessage);
        logError('updateDataToGitHub', error, { errorType, httpStatus });
        showError(errorMessage);
        
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

function showMessage(message, type = 'error') {
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
        }, 10000);
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
    
    // Then fetch from GitHub - this should overwrite localStorage data if available
    await fetchDataFromGitHub();
    
    // Ensure we have at least one tab after loading from all sources
    if (!appData.tabs || appData.tabs.length === 0) {
        appData.tabs = [{ id: 'tab_' + Date.now(), name: 'My List' }];
        // Save the default tab to GitHub if we have a token
        if (GITHUB_CONFIG.token) {
            await updateDataToGitHub('Initialize default tab');
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
}

function setupEventListeners() {
    // Date navigation
    document.getElementById('prevDay').addEventListener('click', () => changeDate(-1));
    document.getElementById('nextDay').addEventListener('click', () => changeDate(1));

    // Update button - save immediately
    document.getElementById('updateBtn').addEventListener('click', saveDataImmediately);

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', refreshData);

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
    
    // Download button
    document.getElementById('downloadBtn').addEventListener('click', downloadData);
    
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
    updateDataToGitHub('Update daily data');
}

function getTabs() {
    // Don't create default tabs here - this causes sync issues
    // Default tabs should only be created during initialization if needed
    return appData.tabs || [];
}

function saveTabs(tabs) {
    appData.tabs = tabs;
    updateDataToGitHub('Update tabs');
}

function getListItems(tabId) {
    if (!appData.listItems[tabId]) {
        appData.listItems[tabId] = '';
    }
    return appData.listItems[tabId];
}

function saveListItems(tabId, items) {
    appData.listItems[tabId] = items;
    updateDataToGitHub('Update list items');
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
    
    // Save to GitHub once with both changes
    updateDataToGitHub('Move task between dates');
    
    // Reload tasks for current view
    loadTasks();
}

// Save data immediately to GitHub
async function saveDataImmediately() {
    try {
        await updateDataToGitHub('Manual update - save immediately');
        showMessage('Data saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving data:', error);
        showError('Failed to save data. Please try again.');
    }
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
    updateDataToGitHub('Delete tab');

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
async function refreshData() {
    try {
        // Attempt to write current data to GitHub first
        try {
            await updateDataToGitHub('Manual refresh - save current state');
        } catch (saveError) {
            console.log('Save during refresh failed, continuing with fetch:', saveError);
        }
        
        // Then fetch the latest data from GitHub
        await fetchDataFromGitHub();
        
        // Update UI with the latest data
        updateDateDisplay();
        loadDisciplines();
        loadTasks();
        loadTabs();
        loadCurrentTab();
        
        // Show success message
        showMessage('Data refreshed successfully!', 'success');
    } catch (error) {
        console.error('Error refreshing data:', error);
        showError('Failed to refresh data. Please try again.');
    }
}

function updateTokenStatus() {
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
    
    // Show success message
    showMessage('GitHub token saved successfully! The app will now sync with GitHub.', 'success');
    
    // Close the config section
    const configDetails = document.getElementById('configDetails');
    if (configDetails) {
        configDetails.removeAttribute('open');
    }
    
    // Fetch data from GitHub with new token
    fetchDataFromGitHub().then(() => {
        updateDateDisplay();
        loadDisciplines();
        loadTasks();
        loadTabs();
        loadCurrentTab();
    });
}

function clearGitHubToken() {
    if (!confirm('Are you sure you want to clear the GitHub token? The app will only save data locally after this.')) {
        return;
    }
    
    // Remove from localStorage
    localStorage.removeItem('githubToken');
    
    // Update the config
    GITHUB_CONFIG.token = '';
    
    // Update status
    updateTokenStatus();
    
    // Show message
    showMessage('GitHub token cleared. The app will now only save data locally.', 'success');
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
