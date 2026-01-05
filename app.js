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

// GitHub API Functions
async function fetchDataFromGitHub() {
    try {
        showSyncIndicator('loading');
        
        // Fetch file metadata to get SHA
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
        
        // Fetch actual data content
        const dataResponse = await fetch(
            `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.dataPath}`
        );
        
        if (!dataResponse.ok) {
            throw new Error(`Failed to fetch data: ${dataResponse.status}`);
        }
        
        const data = await dataResponse.json();
        appData = data;
        
        hideSyncIndicator();
        return data;
    } catch (error) {
        console.error('Error fetching data from GitHub:', error);
        hideSyncIndicator();
        showError('Failed to load data from GitHub. Using local fallback.');
        
        // Fallback to localStorage if GitHub fetch fails
        return loadFromLocalStorageFallback();
    }
}

async function updateDataToGitHub(message = 'Update data') {
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
        
        // Fetch latest SHA before updating
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
    const data = {
        dateEntries: {},
        tabs: [],
        listItems: {}
    };
    
    // Try to load existing localStorage data
    const tabsData = localStorage.getItem('dailyBoard_global_tabs');
    if (tabsData) {
        data.tabs = JSON.parse(tabsData);
    } else {
        data.tabs = [{ id: 'tab_' + Date.now(), name: 'My List' }];
    }
    
    return data;
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
    // Show loading indicator
    showSyncIndicator('loading');
    
    // Try to load from localStorage backup first for immediate display
    loadFromLocalStorage();
    
    updateDateDisplay();
    loadDisciplines();
    loadTasks();
    loadTabs();
    loadCurrentTab();
    
    // Then fetch from GitHub in the background
    await fetchDataFromGitHub();
    
    // Only refresh UI if data changed
    updateDateDisplay();
    loadDisciplines();
    loadTasks();
    loadTabs();
    loadCurrentTab();
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
    
    // GitHub token configuration
    document.getElementById('saveTokenBtn').addEventListener('click', saveGitHubToken);
    document.getElementById('clearTokenBtn').addEventListener('click', clearGitHubToken);
    
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
    if (!appData.tabs || appData.tabs.length === 0) {
        appData.tabs = [{ id: 'tab_' + Date.now(), name: 'My List' }];
    }
    return appData.tabs;
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
    const container = document.getElementById('disciplinesList');
    container.innerHTML = '';

    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    const savedDisciplines = dateEntry.disciplines || {};

    FIXED_DISCIPLINES.forEach((discipline, index) => {
        const isCompleted = savedDisciplines[index] || false;
        const disciplineElement = createDisciplineElement(discipline, index, isCompleted);
        container.appendChild(disciplineElement);
    });
    
    // Add dynamic tasks after fixed disciplines
    let tasks = dateEntry.tasks || [];
    
    // Render tasks in their current order (no sorting, user can drag to reorder)
    tasks.forEach((task, index) => {
        const taskElement = createTaskElement(task, index);
        container.appendChild(taskElement);
    });
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
    div.appendChild(leftDiv);

    return div;
}

function toggleDiscipline(index, isCompleted) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    dateEntry.disciplines[index] = isCompleted;
    saveDateEntry(dateKey, dateEntry);
    loadDisciplines();
}

// Tasks management
function loadTasks() {
    // Tasks are now displayed in the disciplines section
    // This function is kept for compatibility but doesn't render anything
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
    
    const priorityBtn = document.createElement('button');
    priorityBtn.className = 'priority-btn' + (task.priority ? ' active' : '');
    priorityBtn.textContent = '⭐';
    priorityBtn.title = task.priority ? 'Remove from top 3' : 'Add to top 3';
    priorityBtn.addEventListener('click', () => toggleTaskPriority(index));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteTask(index));

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
    loadDisciplines();
}

function toggleTask(index, isCompleted) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    if (dateEntry.tasks[index]) {
        dateEntry.tasks[index].completed = isCompleted;
        saveDateEntry(dateKey, dateEntry);
        loadDisciplines();
    }
}

function deleteTask(index) {
    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    dateEntry.tasks.splice(index, 1);
    saveDateEntry(dateKey, dateEntry);
    loadDisciplines();
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
    loadDisciplines();
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

// GitHub Token Configuration Functions
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

function handleDragStart(e) {
    draggedTaskElement = e.currentTarget;
    draggedTaskIndex = parseInt(draggedTaskElement.dataset.taskIndex);
    e.currentTarget.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    const targetElement = e.currentTarget;
    
    // Only allow dropping on task items
    if (!targetElement.classList.contains('task-item')) {
        return false;
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    // Add visual feedback
    if (targetElement !== draggedTaskElement) {
        targetElement.style.borderTop = '3px solid #667eea';
    }
    
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const targetElement = e.currentTarget;
    
    // Only allow dropping on task items
    if (!targetElement.classList.contains('task-item')) {
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
        tasks.splice(targetTaskIndex, 0, draggedTask);
        
        saveDateEntry(dateKey, dateEntry);
        loadDisciplines();
    }
    
    // Remove visual feedback
    targetElement.style.borderTop = '';
    
    return false;
}

function handleDragEnd(e) {
    e.currentTarget.style.opacity = '1';
    
    // Remove all visual feedback
    const allTaskItems = document.querySelectorAll('.task-item');
    allTaskItems.forEach(item => {
        item.style.borderTop = '';
    });
    
    draggedTaskElement = null;
    draggedTaskIndex = null;
}
