# Daily Board

A streamlined daily discipline tracker with weekly planning view.

## Features

- **Daily Disciplines**: Track 5 fixed daily habits
  - WH Breathing
  - Yoga
  - Pull up bar / weights
  - Review Goals and Actions
  - Update Finances
- **Dynamic Tasks**: Add custom daily tasks dynamically
- **Day-Specific Tracking**: Each day maintains its own independent state
- **List Management**: Organize and maintain lists with multiple tabs
- **Weekly View**: See and manage an entire week at a glance

## Installation

1. Clone the repository:
```bash
git clone https://github.com/markvanengelen-gulo/daily-board.git
cd daily-board
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Architecture

### Backend
- Node.js with Express.js server
- SQLite database for data persistence
- RESTful API endpoints for all operations

### Database - SQLite
- Local SQLite database (data/daily-board.db)
- Day-specific task tracking
- List management with tab ordering
- Dynamic task support with focus flags

### Database Schema

#### fixed_daily_tasks Table
- `id`: Primary key
- `date`: Date string (YYYY-MM-DD format)
- `task_name`: Fixed task name
- `completed`: Boolean flag
- `removed`: Boolean flag
- `created_at`: Timestamp

#### dynamic_tasks Table
- `id`: Text primary key
- `date`: Date string (YYYY-MM-DD format)
- `text`: Task description
- `is_focus`: Boolean flag for focus tasks
- `display_order`: Integer for ordering
- `created_at`: Timestamp
- `updated_at`: Timestamp

#### list_tabs Table
- `id`: Primary key
- `name`: Tab name (unique)
- `display_order`: Integer for ordering
- `created_at`: Timestamp
- `updated_at`: Timestamp

#### list_content Table
- `id`: Primary key
- `tab_name`: Tab name (unique reference)
- `content`: Text content
- `created_at`: Timestamp
- `updated_at`: Timestamp

## API Endpoints

### Fixed Daily Tasks
- `GET /api/fixed-tasks/:date` - Get fixed tasks for a specific date
- `POST /api/fixed-tasks/:id/toggle` - Toggle task completion
- `POST /api/fixed-tasks/:id/remove` - Toggle task removed status

### Dynamic Tasks
- `GET /api/dynamic-tasks/:date` - Get dynamic tasks for a specific date
- `POST /api/dynamic-tasks` - Create a new dynamic task
- `PUT /api/dynamic-tasks/:id` - Update a dynamic task
- `DELETE /api/dynamic-tasks/:id` - Delete a dynamic task

### List Management
- `GET /api/lists/tabs` - Get all list tabs
- `POST /api/lists/tabs` - Create a new list tab
- `PUT /api/lists/tabs/:id` - Update a list tab
- `DELETE /api/lists/tabs/:id` - Delete a list tab
- `GET /api/lists/content/:tabName` - Get content for a specific tab
- `POST /api/lists/content` - Save or update content for a specific tab

## Usage

1. **View Week**: Navigate between weeks using the Previous/Next Week buttons or jump to today
2. **Track Fixed Tasks**: Check off your 5 daily disciplines as you complete them
3. **Add Dynamic Tasks**: Add custom tasks for any day in the "Additional Tasks" section
4. **Manage Lists**: Create tabs for different list categories and save content in each tab

## License

ISC
