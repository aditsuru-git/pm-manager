# Productivity Manager - Architecture Documentation

**Purpose:** This document defines the complete architecture, services, and implementation details for the Productivity Manager MVP. The system automates GitHub issue creation and management based on a recurring task schedule. **Note:** _Incomplete task migration is handled by parsing live GitHub issues tagged with `incomplete`, and all issues managed by this system are tagged with `pm-managed`._

---

## 1\. Technology Stack

- **Language:** Node.js with TypeScript
- **GitHub API:** Octokit (`@octokit/rest`)
- **Scheduling:** `node-cron` for internal job scheduling
- **Storage:** Local JSON file for state persistence
- **YAML Parsing:** `js-yaml`
- **Containerization:** Docker (primary deployment)

---

## 2\. Project Structure

```
productivity-manager/
├── src/
│   ├── config/           # Environment and YAML config loading
│   ├── services/         # Core business logic services
│   │   ├── github.service.ts
│   │   ├── scheduler.service.ts
│   │   ├── issue-creator.service.ts
│   │   └── deadline-checker.service.ts
│   ├── types/            # TypeScript interfaces
│   ├── utils/            # Helper functions
│   └── index.ts          # Application entry point
├── data/
│   └── state.json        # Runtime state (Docker volume mount)
├── schedule.yaml         # User's task schedule
├── .env                  # GITHUB_PAT
├── Dockerfile
└── docker-compose.yml
```

---

## 3\. Configuration Files

### schedule.yaml Structure

```yaml
config:
  repo: "username/repo-name"
  timezone: "Asia/Kolkata"

tasks:
  - name: "Morning Study Session"
    category: study
    recurrence:
      days: [monday, wednesday, friday] # or "daily"
    deadline: "18:00" # HH:MM format, 24-hour
    description: |
      Review today's topics
      - [ ] Read chapter notes
      - [ ] Solve practice problems
```

**Field Definitions:**

- `repo`: GitHub repository in `owner/repo` format
- `timezone`: IANA timezone string (e.g., `Asia/Kolkata`, `America/New_York`)
- `days`: Array of lowercase day names OR string `"daily"`
- `deadline`: Time in 24-hour format when task expires
- `description`: Markdown text, must contain checkbox items (`- [ ]`)

### state.json Structure

```json
{
	"last_created_date": "2025-10-23",
	"issues": {
		"123": {
			"category": "study",
			"deadline": "2025-10-23T18:00:00+05:30",
			"created_date": "2025-10-23",
			"expired_as_per_deadline": false
		}
	}
}
```

**Field Definitions:**

- `last_created_date`: ISO date string of last successful issue creation run
- `issues`: Map of GitHub issue number to metadata
- **`incomplete_todos`**: _This field is removed. Incomplete tasks are parsed directly from expired issues on GitHub during the Issue Creator run._

### Environment Variables

```bash
GITHUB_PAT=ghp_xxxxxxxxxxxxx  # GitHub Personal Access Token
LOG_LEVEL=info                 # Optional: debug, info, warn, error
```

**Required PAT Permissions:**

- `repo` (full repository access)
- `project` (manage projects/boards)

---

## 4\. GitHub Label Strategy

All labels are created by the CLI setup command if they don't exist.

| Label            | Color                | Applied By        | Purpose                                                                                                                                                                  |
| :--------------- | :------------------- | :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`pm-managed`** | **`#ededed` (gray)** | **Issue Creator** | **Internal management label.** All issues created by or tracked by the Productivity Manager _must_ have this label. Issues without it are ignored by all service checks. |
| `expired`        | `#d73a4a` (red)      | Deadline Checker  | Issue deadline has passed                                                                                                                                                |
| `incomplete`     | `#fbca04` (yellow)   | Deadline Checker  | Issue expired with unchecked todos, _indicating content for migration_                                                                                                   |
| Category labels  | `#0075ca` (blue)     | Issue Creator     | User-defined categories from YAML (e.g., `study`, `project-x`)                                                                                                           |

**Label Query Pattern:**
Services **must** include the `pm-managed` label in every query to ensure they only process issues created by this system. Example: `labels: ['pm-managed', 'study']`.

---

## 5\. Issue Format

### Title

```
[6:00 PM] Morning Study Session
```

Format: `[{deadline_time_12hr}] {task_name}`

**Note:** Time is for display only, not parsed. Actual deadline is in issue body.

### Body

```markdown
Deadline: 2025-10-23T18:00:00+05:30

Review today's topics

- [ ] Read chapter notes
- [ ] Solve practice problems

---

MIGRATED TODOS:

- [ ] Read chapter 5
- [ ] Practice problems
```

**Critical Requirements:**

- First line MUST be `Deadline: {ISO8601_with_timezone}`
- Checkbox format MUST be `- [ ]` with space between brackets
- Body content comes from YAML `description` field
- **Migrated todos** will be appended under a `MIGRATED TODOS:` section.

### Labels

- **`pm-managed`** (Mandatory for all managed issues)
- Category label (e.g., `study`)
- Additional labels added during lifecycle (`expired`, `incomplete`)

### Assignee

Current authenticated GitHub user (from PAT)

---

## 6\. Service Specifications

### 6.1 Config Service

**Purpose:** Load and parse `schedule.yaml`, validate structure.

**Location:** `src/config/schedule.config.ts`

**Exports:**

```ts
interface TaskConfig {
	name: string;
	category: string;
	recurrence: {
		days: string[] | "daily";
	};
	deadline: string; // HH:MM format
	description: string;
}

interface ScheduleConfig {
	repo: string;
	timezone: string;
	tasks: TaskConfig[];
}

function loadSchedule(): ScheduleConfig;
```

**Implementation Notes:**

- Use `js-yaml` to parse file
- Validate required fields exist
- If validation fails, throw error and exit process
- Convert `days` to lowercase for consistency
- Cache parsed config in memory after first load

**Error Handling:**

- File not found $\rightarrow$ Exit with error message
- Invalid YAML syntax $\rightarrow$ Exit with parse error
- Missing required fields $\rightarrow$ Exit with validation error

---

### 6.2 GitHub Service

**Purpose:** Wrapper around Octokit for all GitHub API operations.

**Location:** `src/services/github.service.ts`

**Class Structure:**

```ts
class GitHubService {
	private octokit: Octokit;
	private owner: string;
	private repo: string;

	constructor(pat: string, repoFullName: string);

	// Label operations
	async labelExists(name: string): Promise<boolean>;
	async createLabel(name: string, color: string): Promise<void>;

	// Issue operations
	async createIssue(params: { title: string; body: string; labels: string[]; assignees: string[] }): Promise<number>; // Returns issue number

	async closeIssue(issueNumber: number): Promise<void>;
	async addLabels(issueNumber: number, labels: string[]): Promise<void>;
	async getIssue(issueNumber: number): Promise<IssueData>;

	async getOpenIssuesByLabel(label: string): Promise<IssueData[]>; // Implictly queries 'pm-managed'
	async getClosedIssuesByLabel(label: string): Promise<IssueData[]>; // Implictly queries 'pm-managed'

	// Board operations
	async createKanbanBoard(name: string): Promise<void>;
	async getAuthenticatedUser(): Promise<string>; // Returns username
}

interface IssueData {
	number: number;
	title: string;
	body: string;
	labels: string[];
	state: "open" | "closed";
}
```

**Implementation Notes:**

- All issue retrieval methods (`getOpenIssuesByLabel`, `getClosedIssuesByLabel`) must internally **mandate the inclusion of the `pm-managed` label** in their GitHub API call.
- Initialize Octokit with PAT: `new Octokit({ auth: pat })`
- Parse `owner/repo` from `repoFullName` in constructor
- Board creation: Use GitHub Projects v2 API, create with columns: "Ready", "In Progress", "Done"
- Configure board to auto-add issues on creation

**Error Handling:**

- API rate limit (403) $\rightarrow$ Log error, exit process with code 1
- Authentication failure (401) $\rightarrow$ Log error, exit process with code 1
- Repository not found (404) $\rightarrow$ Log error, exit process with code 1
- Network errors $\rightarrow$ Log error, retry once, then exit if still fails

---

### 6.3 State Service

**Purpose:** Manage local `state.json` file operations.

**Location:** `src/services/state.service.ts`

**Exports:**

```ts
interface IssueState {
	category: string;
	deadline: string; // ISO8601 with timezone
	created_date: string; // YYYY-MM-DD
	expired_as_per_deadline: boolean;
}

interface AppState {
	last_created_date: string; // YYYY-MM-DD
	issues: Record<string, IssueState>; // issue number → metadata
}

class StateService {
	private filePath: string;

	constructor(filePath: string);

	load(): AppState;
	save(state: AppState): void;

	// Helper methods
	shouldCreateIssuesForToday(currentDate: string): boolean;
	markIssuesCreated(currentDate: string): void;
	addIssue(issueNumber: string, metadata: IssueState): void;
	markIssueExpired(issueNumber: string): void;
}
```

**Implementation Notes:**

- Use `fs.readFileSync` / `fs.writeFileSync` with `utf-8` encoding
- If file doesn't exist on first load, create with default structure:
  ```json
  {
  	"last_created_date": "",
  	"issues": {}
  }
  ```
- Save after every state modification
- `shouldCreateIssuesForToday()`: Compare `last_created_date` with current date

**Error Handling:**

- File read/write errors $\rightarrow$ Log error, exit process
- JSON parse errors $\rightarrow$ Log error, exit process

---

### 6.4 Issue Creator Service

**Purpose:** Create GitHub issues for today's scheduled tasks, including migration of incomplete todos from past issues.

**Location:** `src/services/issue-creator.service.ts`

**Exports:**

```ts
class IssueCreatorService {
	constructor(private github: GitHubService, private state: StateService, private schedule: ScheduleConfig);

	async run(): Promise<void>;
}
```

**Algorithm:**

1.  Get current date in configured timezone (use `date-fns-tz`)
2.  Check state: if `last_created_date === today`, exit early
3.  Get day of week from current date (lowercase)
4.  Filter tasks where `recurrence.days === "daily"` OR includes current day
5.  **Get all closed issues with the `incomplete` label** via `GitHubService.getClosedIssuesByLabel('incomplete')`. (The underlying query implicitly includes `pm-managed`).
6.  **Group incomplete todos by category** by parsing the body of each retrieved incomplete issue. Requires a utility method to extract and map todos based on the category label of the source issue.
7.  For each matching task:
    - Look up incomplete todos for this task's category from the list generated in step 6.
    - Format deadline as ISO8601 with timezone
    - Build issue body, including the `MIGRATED TODOS` section if necessary.
    - Format title: `[{deadline_12hr}] {task.name}`
    - Get authenticated username
    - Define labels: `[task.category, 'pm-managed']`
    - Create issue via GitHub service. If successful:
      - Add issue to state with metadata
      - **Close the original `incomplete` issues** that contributed todos to this new issue to clean up the GitHub board.
8.  Update state: `last_created_date = today`

**Duplicate Prevention:**
If creation fails for an issue (API error), continue with remaining tasks. Don't update `last_created_date` if ANY creation failed. Only close source `incomplete` issues if the new issue was created successfully.

**Error Handling:**

- GitHub API errors $\rightarrow$ Log which task failed, continue with rest
- If ANY failure occurs, don't update `last_created_date` (will retry on next run)

---

### 6.5 Deadline Checker Service

**Purpose:** Check issues in state for deadline expiration, close and label them.

**Location:** `src/services/deadline-checker.service.ts`

**Exports:**

```ts
class DeadlineCheckerService {
	constructor(private github: GitHubService, private state: StateService);

	async checkDeadlines(): Promise<void>;
}
```

**Algorithm:**

1.  Get current time in configured timezone
2.  Load state
3.  For each issue in `state.issues`:
    - Skip if `expired_as_per_deadline === true`
    - Parse deadline from ISO8601 string
    - If deadline \< current time:
      - Fetch issue from GitHub
      - If issue is already closed, mark in state and skip
      - Parse body for checkboxes
      - Count unchecked items: `- [ ]` (with space)
      - Close issue via GitHub service
      - Add `expired` label
      - If unchecked count \> 0:
        - Add `incomplete` label
      - Mark `expired_as_per_deadline = true` in state

**Checkbox Parsing:**

```ts
function extractUncheckedTodos(body: string): string[] {
	const lines = body.split("\n");
	// Skip first line (deadline)
	const contentLines = lines.slice(1);
	return contentLines.filter((line) => line.trim().startsWith("- [ ]"));
}
```

**Error Handling:**

- Issue not found (404) $\rightarrow$ Remove from state, continue
- API errors $\rightarrow$ Log error, skip this issue, continue with rest
- Parse errors $\rightarrow$ Log warning, treat as complete, close issue

---

### 6.6 Scheduler Service

**Purpose:** Set up cron jobs based on YAML schedule and orchestrate service execution.

**Location:** `src/services/scheduler.service.ts`

**Exports:**

```ts
class SchedulerService {
	constructor(
		private schedule: ScheduleConfig,
		private issueCreator: IssueCreatorService,
		private deadlineChecker: DeadlineCheckerService
	);

	start(): void;
}
```

**Cron Job Setup:**

1.  **Hourly Issue Creator Check** - `0 * * * *` (every hour)

    ```ts
    cron.schedule("0 * * * *", async () => {
    	await issueCreator.run();
    });
    ```

2.  **Per-Task Deadline Checkers** - Dynamic based on YAML

    ```ts
    // For each unique deadline time in schedule
    for (const task of schedule.tasks) {
    	const cronTime = convertToCron(task.deadline, task.recurrence.days);
    	cron.schedule(
    		cronTime,
    		async () => {
    			await deadlineChecker.checkDeadlines();
    		},
    		{ timezone: schedule.timezone }
    	);
    }
    ```

3.  **End-of-Day Check** - `59 23 * * *` (11:59 PM)

    ```ts
    cron.schedule(
    	"59 23 * * *",
    	async () => {
    		await deadlineChecker.checkDeadlines();
    	},
    	{ timezone: schedule.timezone }
    );
    ```

**Cron Time Conversion:**

```ts
function convertToCron(time: string, days: string[] | "daily"): string {
	const [hour, minute] = time.split(":");

	if (days === "daily") {
		return `${minute} ${hour} * * *`;
	}

	const dayMap = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	};

	const dayNumbers = days.map((day) => dayMap[day.toLowerCase()]);

	return `${minute} ${hour} * * ${dayNumbers.join(",")}`;
}
```

**Timezone Handling:**
Use `node-cron` with timezone option:

```ts
cron.schedule(cronTime, fn, { timezone: schedule.timezone });
```

**Error Handling:**

- Cron job errors $\rightarrow$ Log error, continue (don't crash daemon)
- Invalid cron expression $\rightarrow$ Log error at startup, exit

---

## 7\. CLI Commands

### Setup Command

**Command:** `npm run setup`

**Purpose:** One-time repository setup.

**Steps:**

1.  Load schedule.yaml
2.  Initialize GitHub service
3.  Check if Kanban board exists (query projects)
4.  If not exists, create board with columns: "Ready", "In Progress", "Done"
5.  Configure board to auto-add issues
6.  Check if category labels exist
7.  Create missing category labels with color `#0075ca`
8.  Create `expired` label (`#d73a4a`) if missing
9.  Create `incomplete` label (`#fbca04`) if missing
10. **Create `pm-managed` label (`#ededed`) if missing**
11. Log success message
12. Exit process

**Error Handling:**

- GitHub API errors $\rightarrow$ Log error, exit with code 1
- YAML errors $\rightarrow$ Log error, exit with code 1

### Sync Command

**Command:** `npm run sync`

**Purpose:** Rebuild state.json from schedule.yaml and current GitHub issues.

**Steps:**

1.  Load schedule.yaml
2.  Initialize GitHub service
3.  Create empty state structure
4.  Query all open issues with category labels from YAML. **The GitHub query automatically includes the `pm-managed` label.**
5.  For each open issue:
    - Parse deadline from body
    - Check if deadline is today or future
    - Add to `state.issues` if relevant
6.  Set `last_created_date` based on existing issues for today
7.  Save state.json
8.  Log success message
9.  Exit process

**Error Handling:**

- API errors $\rightarrow$ Log error, exit with code 1
- Parse errors $\rightarrow$ Log warning, skip issue

### Run Command

**Command:** `npm start`

**Purpose:** Start the daemon process.

**Steps:**

1.  Load schedule.yaml
2.  Load state.json
3.  Initialize all services
4.  Run Issue Creator immediately (startup check)
5.  Start scheduler with cron jobs
6.  Log "Daemon started" message
7.  Keep process running

**Error Handling:**

- Startup errors $\rightarrow$ Log error, exit with code 1
- Runtime errors $\rightarrow$ Log error, continue (don't crash)

---

## 8\. Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
VOLUME /app/data
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: "3.8"
services:
  productivity-manager:
    build: .
    volumes:
      - ./data:/app/data
      - ./schedule.yaml:/app/schedule.yaml:ro
    env_file:
      - .env
    restart: unless-stopped
```

### User Setup Guide

1.  Clone repository
2.  Copy `schedule.yaml.example` to `schedule.yaml`, configure tasks
3.  Copy `.env.example` to `.env`, add `GITHUB_PAT`
4.  Run `docker-compose run --rm productivity-manager npm run setup`
5.  Run `docker-compose up -d`

---

## 9\. Error Boundaries and Fault Tolerance

### Principle

**"Fail fast, fail explicitly"** - Never proceed with undefined behavior.

### Fault Scenarios

| Scenario                                                  | Behavior                                                                                                                                                                   |
| :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub API rate limit hit                                 | Log error, exit process with code 1                                                                                                                                        |
| Invalid YAML syntax                                       | Log error, exit process with code 1                                                                                                                                        |
| Missing required YAML fields                              | Log error, exit process with code 1                                                                                                                                        |
| PAT authentication fails                                  | Log error, exit process with code 1                                                                                                                                        |
| Repository not found                                      | Log error, exit process with code 1                                                                                                                                        |
| State file corrupted                                      | Log error, exit process with code 1                                                                                                                                        |
| Issue body missing deadline                               | Log warning, skip issue                                                                                                                                                    |
| Issue not found during check                              | Log warning, remove from state                                                                                                                                             |
| **Managed issue is missing `pm-managed` label in GitHub** | **GitHub service will ignore it, Deadline Checker will effectively skip it, potentially leading to the issue remaining in the state until manually corrected or expired.** |
| Partial issue creation failure                            | Log error, don't update `last_created_date`                                                                                                                                |
| Network timeout                                           | Retry once, log error, continue or exit based on operation                                                                                                                 |

### No Automatic Fixes

- Don't auto-create missing labels during runtime (only in setup)
- Don't auto-fix malformed issue bodies
- Don't auto-recover from rate limits
- Don't silently ignore API errors

### Logging Requirements

- Log level controlled by `LOG_LEVEL` env var
- Always log: API errors, state changes, cron job executions
- Debug level: detailed operation flow
- Use structured logging (JSON format)
