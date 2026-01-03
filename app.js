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

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
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

// Local storage helpers
function getStorageKey(type) {
    return `dailyBoard_${type}_${getDateKey()}`;
}

function getGlobalStorageKey(type) {
    return `dailyBoard_global_${type}`;
}

function saveToStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function loadFromStorage(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
}

// Disciplines management
function loadDisciplines() {
    const container = document.getElementById('disciplinesList');
    container.innerHTML = '';

    const savedDisciplines = loadFromStorage(getStorageKey('disciplines')) || {};

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
    const savedDisciplines = loadFromStorage(getStorageKey('disciplines')) || {};
    savedDisciplines[index] = isCompleted;
    saveToStorage(getStorageKey('disciplines'), savedDisciplines);
    loadDisciplines();
}

// Tasks management
function loadTasks() {
    const container = document.getElementById('tasksList');
    container.innerHTML = '';

    const tasks = loadFromStorage(getStorageKey('tasks')) || [];

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

    const tasks = loadFromStorage(getStorageKey('tasks')) || [];
    tasks.push({ name: taskName, completed: false });
    saveToStorage(getStorageKey('tasks'), tasks);

    input.value = '';
    loadTasks();
}

function toggleTask(index, isCompleted) {
    const tasks = loadFromStorage(getStorageKey('tasks')) || [];
    if (tasks[index]) {
        tasks[index].completed = isCompleted;
        saveToStorage(getStorageKey('tasks'), tasks);
        loadTasks();
    }
}

function deleteTask(index) {
    const tasks = loadFromStorage(getStorageKey('tasks')) || [];
    tasks.splice(index, 1);
    saveToStorage(getStorageKey('tasks'), tasks);
    loadTasks();
}

// Tabs/Lists management
function loadTabs() {
    const container = document.getElementById('tabsContainer');
    container.innerHTML = '';

    let tabs = loadFromStorage(getGlobalStorageKey('tabs')) || [];

    // Initialize with a default tab if none exist
    if (tabs.length === 0) {
        tabs = [{ id: 'tab_' + Date.now(), name: 'My List' }];
        saveToStorage(getGlobalStorageKey('tabs'), tabs);
    }

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
    button.appendChild(nameSpan);

    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'tab-delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTab(tab.id);
    });

    button.appendChild(deleteBtn);
    button.addEventListener('click', () => switchTab(tab.id));

    return button;
}

function addTab() {
    const tabs = loadFromStorage(getGlobalStorageKey('tabs')) || [];
    const tabNumber = tabs.length + 1;
    const newTab = {
        id: 'tab_' + Date.now(),
        name: `List ${tabNumber}`
    };

    tabs.push(newTab);
    saveToStorage(getGlobalStorageKey('tabs'), tabs);

    currentTabId = newTab.id;
    loadTabs();
    loadCurrentTab();
}

function deleteTab(tabId) {
    let tabs = loadFromStorage(getGlobalStorageKey('tabs')) || [];
    
    if (tabs.length <= 1) {
        alert('You must have at least one list!');
        return;
    }

    tabs = tabs.filter(tab => tab.id !== tabId);
    saveToStorage(getGlobalStorageKey('tabs'), tabs);

    // Clear items for this tab
    localStorage.removeItem(getGlobalStorageKey(`listItems_${tabId}`));

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

    const items = loadFromStorage(getGlobalStorageKey(`listItems_${currentTabId}`)) || [];

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

    const items = loadFromStorage(getGlobalStorageKey(`listItems_${currentTabId}`)) || [];
    items.push({ name: itemName, completed: false });
    saveToStorage(getGlobalStorageKey(`listItems_${currentTabId}`), items);

    input.value = '';
    loadCurrentTab();
}

function toggleListItem(index, isCompleted) {
    const items = loadFromStorage(getGlobalStorageKey(`listItems_${currentTabId}`)) || [];
    if (items[index]) {
        items[index].completed = isCompleted;
        saveToStorage(getGlobalStorageKey(`listItems_${currentTabId}`), items);
        loadCurrentTab();
    }
}

function deleteListItem(index) {
    const items = loadFromStorage(getGlobalStorageKey(`listItems_${currentTabId}`)) || [];
    items.splice(index, 1);
    saveToStorage(getGlobalStorageKey(`listItems_${currentTabId}`), items);
    loadCurrentTab();
}
