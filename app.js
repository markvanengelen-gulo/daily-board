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
    
    try {
        isSyncing = true;
        showSyncIndicator('saving');
        
        if (!GITHUB_CONFIG.token) {
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
            const errorData = await response.json();
            throw new Error(`Failed to update data: ${errorData.message || response.status}`);
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
        showError('Failed to save data to GitHub. Changes saved locally.');
        
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

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
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

    // List items
    document.getElementById('addListItemBtn').addEventListener('click', addListItem);
    document.getElementById('newListItemInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addListItem();
    });

    // Add tab
    document.getElementById('addTabBtn').addEventListener('click', addTab);
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
        appData.listItems[tabId] = [];
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
    const container = document.getElementById('tasksList');
    container.innerHTML = '';

    const dateKey = getDateKey();
    const dateEntry = getDateEntry(dateKey);
    const tasks = dateEntry.tasks || [];

    if (tasks.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No tasks for this day. Add one above!';
        container.appendChild(emptyState);
        return;
    }

    tasks.forEach((task, index) => {
        const taskElement = createTaskElement(task, index);
        container.appendChild(taskElement);
    });
}

function createTaskElement(task, index) {
    const div = document.createElement('div');
    div.className = 'task-item';

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

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteTask(index));

    div.appendChild(leftDiv);
    div.appendChild(deleteBtn);

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
    const container = document.getElementById('listItems');
    container.innerHTML = '';

    if (!currentTabId) return;

    const items = getListItems(currentTabId);

    if (items.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No items in this list. Add one above!';
        container.appendChild(emptyState);
        return;
    }

    items.forEach((item, index) => {
        const itemElement = createListItemElement(item, index);
        container.appendChild(itemElement);
    });
}

function createListItemElement(item, index) {
    const div = document.createElement('div');
    div.className = 'list-item';

    const leftDiv = document.createElement('div');
    leftDiv.className = 'item-left';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = item.completed;
    checkbox.addEventListener('change', () => toggleListItem(index, checkbox.checked));

    const label = document.createElement('span');
    label.className = 'item-label' + (item.completed ? ' completed' : '');
    label.textContent = item.name;

    leftDiv.appendChild(checkbox);
    leftDiv.appendChild(label);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteListItem(index));

    div.appendChild(leftDiv);
    div.appendChild(deleteBtn);

    return div;
}

function addListItem() {
    const input = document.getElementById('newListItemInput');
    const itemName = input.value.trim();

    if (!itemName || !currentTabId) return;

    const items = getListItems(currentTabId);
    items.push({ name: itemName, completed: false });
    saveListItems(currentTabId, items);

    input.value = '';
    loadCurrentTab();
}

function toggleListItem(index, isCompleted) {
    const items = getListItems(currentTabId);
    if (items[index]) {
        items[index].completed = isCompleted;
        saveListItems(currentTabId, items);
        loadCurrentTab();
    }
}

function deleteListItem(index) {
    const items = getListItems(currentTabId);
    items.splice(index, 1);
    saveListItems(currentTabId, items);
    loadCurrentTab();
}
