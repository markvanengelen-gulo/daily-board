// API Base URL
const API_BASE = '/api';

// State management
let currentWeekStart = getMonday(new Date());
let currentActiveTab = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeWeekView();
  initializeListTabs();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('prevWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    initializeWeekView();
  });

  document.getElementById('nextWeek').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    initializeWeekView();
  });

  document.getElementById('today').addEventListener('click', () => {
    currentWeekStart = getMonday(new Date());
    initializeWeekView();
  });

  document.getElementById('addTabBtn').addEventListener('click', addNewTab);
  document.getElementById('saveContentBtn').addEventListener('click', saveTabContent);
}

// Get Monday of the week for a given date
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Format date for display
function formatDisplayDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// Initialize week view
async function initializeWeekView() {
  const weekView = document.getElementById('weekView');
  weekView.innerHTML = '';

  // Update week display
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  document.getElementById('weekDisplay').textContent = 
    `${formatDisplayDate(currentWeekStart)} - ${formatDisplayDate(weekEnd)}`;

  // Create columns for each day of the week
  for (let i = 0; i < 7; i++) {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    const dateStr = formatDate(date);

    const dayColumn = document.createElement('div');
    dayColumn.className = 'day-column';
    
    // Highlight today
    if (dateStr === formatDate(new Date())) {
      dayColumn.classList.add('today');
    }

    dayColumn.innerHTML = `
      <div class="day-header">
        <span class="day-name">${formatDisplayDate(date).split(',')[0]}</span>
        <span class="day-date">${date.getDate()}</span>
      </div>
      <div class="fixed-tasks" data-date="${dateStr}"></div>
      <div class="dynamic-tasks">
        <div class="dynamic-tasks-header">Additional Tasks</div>
        <div class="dynamic-tasks-list" data-date="${dateStr}"></div>
        <div class="add-task-form">
          <input type="text" placeholder="Add task..." data-date="${dateStr}">
          <button onclick="addDynamicTask('${dateStr}', this)">+</button>
        </div>
      </div>
    `;

    weekView.appendChild(dayColumn);

    // Load tasks for this day
    loadFixedTasks(dateStr);
    loadDynamicTasks(dateStr);
  }
}

// Load fixed tasks for a specific date
async function loadFixedTasks(date) {
  try {
    const response = await fetch(`${API_BASE}/fixed-tasks/${date}`);
    const tasks = await response.json();

    const container = document.querySelector(`.fixed-tasks[data-date="${date}"]`);
    container.innerHTML = '';

    tasks.forEach(task => {
      const taskItem = document.createElement('div');
      taskItem.className = 'task-item';
      if (task.completed) taskItem.classList.add('completed');
      if (task.removed) taskItem.classList.add('removed');

      taskItem.innerHTML = `
        <input type="checkbox" 
               id="task-${task.id}" 
               ${task.completed ? 'checked' : ''}
               onchange="toggleFixedTask(${task.id})">
        <label for="task-${task.id}">${task.task_name}</label>
      `;

      container.appendChild(taskItem);
    });
  } catch (error) {
    console.error('Error loading fixed tasks:', error);
  }
}

// Toggle fixed task completion
async function toggleFixedTask(taskId) {
  try {
    await fetch(`${API_BASE}/fixed-tasks/${taskId}/toggle`, {
      method: 'POST'
    });
  } catch (error) {
    console.error('Error toggling task:', error);
  }
}

// Load dynamic tasks for a specific date
async function loadDynamicTasks(date) {
  try {
    const response = await fetch(`${API_BASE}/dynamic-tasks/${date}`);
    const tasks = await response.json();

    const container = document.querySelector(`.dynamic-tasks-list[data-date="${date}"]`);
    container.innerHTML = '';

    tasks.forEach(task => {
      const taskItem = document.createElement('div');
      taskItem.className = 'dynamic-task-item';
      if (task.is_focus) taskItem.classList.add('focus');

      taskItem.innerHTML = `
        <span>${task.text}</span>
        <button onclick="deleteDynamicTask('${task.id}', '${date}')">×</button>
      `;

      container.appendChild(taskItem);
    });
  } catch (error) {
    console.error('Error loading dynamic tasks:', error);
  }
}

// Add dynamic task
async function addDynamicTask(date, button) {
  const input = button.previousElementSibling;
  const text = input.value.trim();

  if (!text) return;

  try {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    await fetch(`${API_BASE}/dynamic-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: taskId,
        date: date,
        text: text,
        is_focus: 0,
        display_order: 0
      })
    });

    input.value = '';
    loadDynamicTasks(date);
  } catch (error) {
    console.error('Error adding dynamic task:', error);
  }
}

// Delete dynamic task
async function deleteDynamicTask(taskId, date) {
  try {
    await fetch(`${API_BASE}/dynamic-tasks/${taskId}`, {
      method: 'DELETE'
    });

    loadDynamicTasks(date);
  } catch (error) {
    console.error('Error deleting dynamic task:', error);
  }
}

// Initialize list tabs
async function initializeListTabs() {
  try {
    const response = await fetch(`${API_BASE}/lists/tabs`);
    const tabs = await response.json();

    const tabsContainer = document.getElementById('listTabs');
    tabsContainer.innerHTML = '';

    if (tabs.length === 0) {
      // Create a default tab
      await createTab('General');
      initializeListTabs();
      return;
    }

    tabs.forEach((tab, index) => {
      const tabElement = document.createElement('button');
      tabElement.className = 'tab';
      tabElement.textContent = tab.name;
      tabElement.onclick = () => selectTab(tab.name);

      if (index === 0 && !currentActiveTab) {
        tabElement.classList.add('active');
        currentActiveTab = tab.name;
        loadTabContent(tab.name);
      } else if (currentActiveTab === tab.name) {
        tabElement.classList.add('active');
      }

      tabsContainer.appendChild(tabElement);
    });
  } catch (error) {
    console.error('Error loading tabs:', error);
  }
}

// Select a tab
function selectTab(tabName) {
  currentActiveTab = tabName;

  // Update active state
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.textContent === tabName) {
      tab.classList.add('active');
    }
  });

  loadTabContent(tabName);
}

// Load tab content
async function loadTabContent(tabName) {
  try {
    const response = await fetch(`${API_BASE}/lists/content/${encodeURIComponent(tabName)}`);
    const data = await response.json();

    document.getElementById('listContent').value = data.content || '';
  } catch (error) {
    console.error('Error loading tab content:', error);
  }
}

// Save tab content
async function saveTabContent() {
  if (!currentActiveTab) return;

  const content = document.getElementById('listContent').value;

  try {
    await fetch(`${API_BASE}/lists/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab_name: currentActiveTab,
        content: content
      })
    });

    alert('Content saved successfully!');
  } catch (error) {
    console.error('Error saving content:', error);
    alert('Error saving content');
  }
}

// Add new tab
async function addNewTab() {
  const tabName = prompt('Enter tab name:');
  if (!tabName || !tabName.trim()) return;

  await createTab(tabName.trim());
  initializeListTabs();
}

// Create a tab
async function createTab(tabName) {
  try {
    await fetch(`${API_BASE}/lists/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tabName,
        display_order: 0
      })
    });
  } catch (error) {
    console.error('Error creating tab:', error);
  }
}

// Make functions globally available
window.toggleFixedTask = toggleFixedTask;
window.addDynamicTask = addDynamicTask;
window.deleteDynamicTask = deleteDynamicTask;
