# PM Manager

A task management tool that converts your schedule into GitHub Issues and tracks them on a Kanban board.

## What It Does

- Creates GitHub issues automatically based on your schedule
- Closes issues at their deadline time
- Migrates incomplete tasks to the next day's issue
- Maintains a Kanban board for task tracking
- Labels issues by category

## Requirements

- Docker and Docker Compose
- GitHub Personal Access Token (classic) with repo and project permissions
- A GitHub repository for task tracking

## Setup

### 1. Create GitHub Repository

Create a new repository on GitHub that will store your tasks as issues.

Example: `my-pm-manager`

This repository will contain all your automated issues and the Kanban board.

### 2. Create GitHub Personal Access Token

Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)

Create a classic token with these scopes:

- `repo` (Full control of private repositories)
- `project` (Full control of projects)

### 3. Clone and Configure

```bash
git clone <repository-url>
cd pm-manager
```

Create `.env` file:

```
GITHUB_PAT=your_personal_access_token
GITHUB_REPO=username/my-pm-manager
LOG_LEVEL=info
NODE_ENV=production
```

Replace `username/my-pm-manager` with your actual GitHub username and repository name.

### 4. Create Schedule File

Create `schedule.yaml` in the project root:

```yaml
repo: username/my-pm-manager
timezone: Asia/Kolkata

tasks:
  - name: Morning Review
    category: daily-review
    recurrence:
      days: [daily]
    deadline: "09:00"
    description: |
      Review yesterday's work
      - [ ] Check completed tasks
      - [ ] Plan today's priorities

  - name: Weekly Planning
    category: weekly-planning
    recurrence:
      days: [monday]
    deadline: "18:00"
    description: |
      Plan the week ahead
      - [ ] Review goals
      - [ ] Schedule meetings
```

### 4. Create Data Directory

```bash
mkdir -p data
```

### 5. Run with Docker

```bash
docker-compose up --build -d
```

View logs:

```bash
docker-compose logs -f
```

Stop the application:

```bash
docker-compose down
```

## Schedule Configuration

### Task Structure

```yaml
- name: Task Name # Display name for the issue
  category: task-category # Unique identifier (used as label)
  recurrence:
    days: [monday, wednesday] # Or use [daily] for every day
  deadline: "HH:MM" # 24-hour format
  description: | # Issue body (supports markdown)
    Task description here
    - [ ] Checklist item 1
    - [ ] Checklist item 2
```

### Recurrence Days

Use lowercase day names:

- `daily` - Every day
- `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`

Examples:

```yaml
recurrence:
  days: [daily]                      # Every day

recurrence:
  days: [monday, wednesday, friday]  # Specific days

recurrence:
  days: [saturday, sunday]           # Weekends only
```

### Deadline Format

Use 24-hour format: `HH:MM`

Examples:

- `09:00` - 9 AM
- `14:30` - 2:30 PM
- `23:59` - 11:59 PM

## How It Works

### Daily Flow

**At Midnight (00:00):**

- Creates issues for tasks scheduled for today
- Migrates incomplete tasks from yesterday's closed issues

**At Each Task's Deadline:**

- Closes open issues for that category
- Adds "incomplete" label if there are unchecked checklist items

### Task Migration

When an issue is closed with incomplete checklist items:

1. Issue gets labeled as "incomplete"
2. Next day's issue includes a "Migrated from previous day" section
3. Unchecked items are copied to the new issue
4. "incomplete" label is removed from old issues

### Labels

The application creates these labels automatically:

- `pm-managed` - All automated issues
- `incomplete` - Issues closed with unfinished tasks
- `<category>` - One label per task category in your schedule

## Kanban Board

The application creates a "Task Manager" project board with three columns:

- Todo - Newly created issues
- In Progress - Issues you're working on
- Done - Closed issues

### Manual Configuration Required

After the board is created, configure these settings manually:

1. Go to your project board
2. Click the view settings
3. Set visible fields to:
   - Title
   - URL
   - Assignees
   - Status
   - Labels

### Recreating the Board

If you need to recreate the Kanban board:

1. Delete the "Task Manager" project in GitHub
2. Restart the application: `docker-compose restart`

The board will be recreated with all workflows configured.

### Workflows

The board has 6 automated workflows:

- Auto add sub issues to project
- Auto add to project (all issues from repository)
- Auto close issue (moves to Done)
- Item added to project (moves to Todo)
- Item closed (moves to Done)
- Item reopened (moves to In Progress)

All workflows apply to issues only, not pull requests.

## Usage Tips

### Adding Custom Tasks

You can create issues manually in your repository. They will automatically:

- Appear on the Kanban board
- Be tracked like any other issue
- Not be automatically closed (only pm-managed issues auto-close)

### Editing Issues

You can edit issue bodies directly on GitHub:

- Add new checklist items as needed
- Update descriptions
- Add notes or comments

The application will respect your changes and migrate any unchecked items if the issue is closed before the deadline.

### Modifying Schedule

1. Edit `schedule.yaml`
2. Restart the application: `docker-compose restart`
3. Changes apply to new issues created at midnight

### Checking Logs

```bash
docker-compose logs -f pm-manager
```

## File Structure

```
pm-manager/
├── data/
│   └── state.json          # Tracks issue creation status (auto-generated)
├── schedule.yaml           # Your task schedule
├── .env                    # Environment configuration
└── docker-compose.yml      # Docker configuration
```

## Troubleshooting

### Issues Not Creating

Check:

- Schedule syntax is correct
- Task categories are unique
- Recurrence days match today
- Application is running

View logs for details:

```bash
docker-compose logs -f
```

### Permission Errors

Verify your GitHub token has:

- `repo` scope
- `project` scope

### Board Not Creating

1. Delete existing "Task Manager" project
2. Restart: `docker-compose restart`
3. Check logs for errors

### State Reset

If you need to reset tracking:

```bash
rm data/state.json
docker-compose restart
```

### Application Restart

The application handles restarts gracefully:

- Checks for missed deadlines on startup
- Processes them if needed
- Continues normal operation

## Community Support

This tool is provided as-is. If you find it useful and would like to contribute improvements, bug fixes, or new features, community contributions are welcome and appreciated. Feel free to open issues or submit pull requests.
