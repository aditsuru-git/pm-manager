# Productivity Manager

The Productivity Manager is designed to organize and automate task management. Tasks will be defined for each day of the week. Some tasks may be recurring, some may be specific to certain days, and others may be added as extras. For the MVP, we will focus exclusively on recurring tasks and defer extras.

### Task Definition and Scheduling

- A simple interface is required for defining the schedule. This could be implemented as a web page, a YAML file, or any other markup format.
- For the MVP, recurring tasks will be supported: either daily or specific to a certain day of the week.
- Each day, the tool will create the tasks scheduled for that day as GitHub issues. Each issue will include:

  - Title
  - Description (body)
  - Labels
  - Deadline

All tasks will have a deadline in the MVP.

### Task Management Workflow

- Once created, tasks are fully under the user’s control for the day.
- Deadlines must be visible to the user, and expired tasks will automatically move to the “Done” section on the Kanban board with an `expired` label.
- Each issue body will contain checkboxes representing subtasks. Completion of all checkboxes is not mandatory but will influence the expiration logic. Unchecked items in unclosed issues will mark the issue as incomplete and tagged `expired`.
- The following day, todos from expired issues will be migrated to new issues corresponding to their category. For example:

  - Categories: `study`, `project X`
  - If a todo from `study` remains incomplete, it will be appended to the default `study` issue for its next recurring day.

**Note:** Each issue must have a category label to facilitate parsing and automation.

### GitHub Agent Service

We will first implement a GitHub agent service with the following capabilities:

- Check if a label already exists
- Create a label with a name and color
- Create an issue with title, description, assignees, and labels
- Close an issue
- Apply a label to an issue
- Create a Kanban board

**Technical Considerations / TODOs**

- Determine how to index issues for uniqueness and parsing
- Design a method for assigning deadlines that can be parsed and displayed to users

### Automation and Deployment

To handle task expiration after deadlines, event listeners or cron jobs will be required. Deployment options include:

1. **Local host using Docker**
2. **Google Containers + Google Cron Scheduler** (limited scheduling capacity)
3. **GitHub Actions** (more restrictive environment)

For the MVP, whichever deployment method is chosen, a clear guide should be provided so that open-source contributors can implement alternative deployment options easily.
