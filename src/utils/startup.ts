import { loadSchedule, stateService, githubService } from "@/services";
import { bulkIssueCreator } from "@/utils/bulkIssueCreator";
import { deadlineHandler } from "@/core/deadlineHandler";
import { logger } from "@/utils";
import type { ScheduleConfig } from "@/services";

export class Startup {
	async initializeState(schedule: ScheduleConfig): Promise<void> {
		logger.info("Initializing local state");

		const existingState = stateService.load();

		// If state is empty, create initial state for all tasks
		if (existingState.length === 0) {
			const initialState = schedule.tasks.map((task) => ({
				category: task.category,
				deadline: task.deadline,
				lastCreatedDate: null,
				deadlineProcessedDate: null,
			}));

			stateService.save(initialState);
			logger.info({ taskCount: initialState.length }, "Initial state created");
		} else {
			// Sync state with schedule (in case new tasks were added)
			const stateCategories = new Set(existingState.map((s) => s.category));
			const newTasks = schedule.tasks.filter((task) => !stateCategories.has(task.category));

			if (newTasks.length > 0) {
				for (const task of newTasks) {
					existingState.push({
						category: task.category,
						deadline: task.deadline,
						lastCreatedDate: null,
						deadlineProcessedDate: null,
					});
				}
				stateService.save(existingState);
				logger.info({ newTaskCount: newTasks.length }, "State synced with new tasks");
			} else {
				logger.info("State already initialized");
			}
		}
	}

	async ensureKanbanBoard(boardName: string): Promise<void> {
		logger.info({ boardName }, "Ensuring Kanban board exists");

		if (await githubService.kanbanBoardExists(boardName)) {
			logger.info("Kanban board already exists");
		} else {
			await githubService.createKanbanBoard(boardName);
			logger.info("Kanban board created");
		}
	}

	async ensureLabels(schedule: ScheduleConfig): Promise<void> {
		logger.info("Ensuring all labels exist");
		await bulkIssueCreator.ensureLabelsExist(schedule);
	}

	async createTodaysIssues(schedule: ScheduleConfig, assignee?: string): Promise<void> {
		logger.info("Creating today's issues");
		await bulkIssueCreator.createTodaysIssues(schedule, assignee);
	}

	async processMissedDeadlines(schedule: ScheduleConfig): Promise<void> {
		logger.info("Processing any missed deadlines");

		const categories = schedule.tasks.map((task) => ({
			category: task.category,
			deadline: task.deadline,
		}));

		await deadlineHandler.processAllDeadlines(categories);
	}

	async run(): Promise<ScheduleConfig> {
		logger.info("Starting application startup sequence");

		// Load schedule
		const schedule = loadSchedule();
		if (!schedule) {
			logger.error("Failed to load schedule");
			process.exit(1);
		}

		logger.info({ taskCount: schedule.tasks.length }, "Schedule loaded");

		try {
			// Get authenticated user for assignee
			const username = await githubService.getAuthenticatedUser();
			logger.info({ username }, "Authenticated with GitHub");

			// Initialize state
			await this.initializeState(schedule);

			// Ensure Kanban board exists
			await this.ensureKanbanBoard("Task Manager");

			// Ensure labels exist
			await this.ensureLabels(schedule);

			// Process missed deadlines first
			await this.processMissedDeadlines(schedule);

			// Create today's issues
			await this.createTodaysIssues(schedule, username);

			logger.info("Startup sequence complete");

			return schedule;
		} catch (error) {
			logger.error({ error }, "Startup sequence failed");
			process.exit(1);
		}
	}
}

export const startup = new Startup();
