# Productivity Manager - Architecture Documentation

**Purpose:** This document defines the complete architecture, services, and implementation details for the Productivity Manager MVP. The system automates GitHub issue creation and management based on a recurring task schedule.

## 1. Technology Stack

- **Language:** Node.js with TypeScript
- **GitHub API:** Octokit (`@octokit/rest`)
- **Scheduling:** `node-cron` for internal job scheduling
- **Storage:** Local JSON file for state persistence
- **YAML Parsing:** `js-yaml`
- **Containerization:** Docker (primary deployment)

## 2. Project Structure

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

## 3. Configuration Files

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
- `category`: unique identifier.

### state.json Structure

```json
[
	{
		"category": "",
		"deadline": "",
		"days": ["monday", "wednesday", "friday"]
	}
]
```
