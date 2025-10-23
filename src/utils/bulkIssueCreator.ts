import { issueCreator } from "@/core/issueCreator";
import { stateService, githubService } from "@/services";
import { logger } from "@/utils";
import type { ScheduleConfig } from "@/services";

export class BulkIssueCreator {
	private getTodayDay(): string {
		const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
		const today = new Date();
		return days[today.getDay()]!;
	}

	private shouldCreateToday(recurrenceDays: string[]): boolean {
		// Check if "daily" is in the recurrence
		if (recurrenceDays.includes("daily")) {
			return true;
		}

		// Check if today matches any of the specified days
		const todayDay = this.getTodayDay();
		return recurrenceDays.map((d) => d.toLowerCase()).includes(todayDay);
	}

	async createTodaysIssues(schedule: ScheduleConfig, assignee?: string): Promise<void> {
		const today = new Date().toISOString().split("T")[0]!;

		logger.info({ date: today }, "Starting bulk issue creation");

		let createdCount = 0;
		let skippedCount = 0;

		for (const task of schedule.tasks) {
			try {
				// Check if we should create this task today
				if (!this.shouldCreateToday(task.recurrence.days)) {
					logger.debug({ category: task.category }, "Task not scheduled for today");
					skippedCount++;
					continue;
				}

				// Check if already created today
				if (!stateService.needsIssueCreation(task.category, today)) {
					logger.debug({ category: task.category }, "Issue already created today");
					skippedCount++;
					continue;
				}

				// Create issue with migration
				const issueNumber = await issueCreator.createIssueWithMigration({
					category: task.category,
					name: task.name,
					description: task.description,
					deadline: task.deadline,
					assignee,
				});

				// Mark as created
				stateService.markIssueCreated(task.category, today);
				createdCount++;

				logger.info({ issueNumber, category: task.category }, "Issue created successfully");
			} catch (error) {
				logger.error({ category: task.category, error }, "Failed to create issue");
				process.exit(1);
			}
		}

		logger.info({ createdCount, skippedCount, total: schedule.tasks.length }, "Bulk issue creation complete");
	}

	async ensureLabelsExist(schedule: ScheduleConfig): Promise<void> {
		logger.info("Ensuring all category labels exist");

		// Always create pm-managed label
		await githubService.createLabel("pm-managed", "0E8A16");

		// Create incomplete label
		await githubService.createLabel("incomplete", "D93F0B");

		// Create category labels
		const colors = [
			"1D76DB", // Blue
			"0E8A16", // Green
			"D93F0B", // Red
			"FBCA04", // Yellow
			"6F42C1", // Purple
			"E99695", // Pink
		];

		for (let i = 0; i < schedule.tasks.length; i++) {
			const task = schedule.tasks[i]!;
			const color = colors[i % colors.length]!;

			try {
				await githubService.createLabel(task.category, color);
			} catch (error) {
				logger.error({ category: task.category, error }, "Failed to create label");
				process.exit(1);
			}
		}

		logger.info("All labels ensured");
	}
}

export const bulkIssueCreator = new BulkIssueCreator();
