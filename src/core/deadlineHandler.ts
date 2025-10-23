import { githubService } from "@/services";
import { todoMigrator } from "@/core";
import { stateService } from "@/services";
import { logger } from "@/utils";

export class DeadlineHandler {
	private parseDeadlineTime(deadline: string): { hours: number; minutes: number } {
		const [hours, minutes] = deadline.split(":").map(Number);
		return { hours, minutes };
	}

	private isDeadlinePassed(deadline: string): boolean {
		const now = new Date();
		const { hours, minutes } = this.parseDeadlineTime(deadline);

		const deadlineTime = new Date();
		deadlineTime.setHours(hours, minutes, 0, 0);

		return now >= deadlineTime;
	}

	async processDeadlineForCategory(category: string, deadline: string): Promise<void> {
		const today = new Date().toISOString().split("T")[0];

		// Check if already processed today
		if (!stateService.needsDeadlineProcessing(category, today)) {
			logger.debug({ category }, "Deadline already processed today");
			return;
		}

		// Check if deadline has passed
		if (!this.isDeadlinePassed(deadline)) {
			logger.debug({ category, deadline }, "Deadline not yet passed");
			return;
		}

		// Get open issues for this category
		const openIssues = await githubService.getIssuesByLabels([category], "open");

		if (openIssues.length === 0) {
			logger.info({ category }, "No open issues to process");
			stateService.markDeadlineProcessed(category, today);
			return;
		}

		let processedCount = 0;
		let incompleteCount = 0;

		for (const issue of openIssues) {
			// Close the issue
			await githubService.closeIssue(issue.number);
			processedCount++;

			// Check for unchecked todos
			if (todoMigrator.hasUncheckedTodos(issue.body)) {
				await githubService.addLabels(issue.number, ["incomplete"]);
				incompleteCount++;
				logger.info({ issueNumber: issue.number, category }, "Issue closed with incomplete todos");
			} else {
				logger.info({ issueNumber: issue.number, category }, "Issue closed");
			}
		}

		// Mark as processed
		stateService.markDeadlineProcessed(category, today);

		logger.info(
			{
				category,
				processedCount,
				incompleteCount,
			},
			"Deadline processing complete"
		);
	}

	async processAllDeadlines(categories: Array<{ category: string; deadline: string }>): Promise<void> {
		logger.info({ count: categories.length }, "Processing deadlines for all categories");

		for (const { category, deadline } of categories) {
			try {
				await this.processDeadlineForCategory(category, deadline);
			} catch (error) {
				logger.error({ category, error }, "Failed to process deadline");
				process.exit(1);
			}
		}

		logger.info("All deadlines processed");
	}

	getNextDeadlineTime(deadline: string): Date {
		const now = new Date();
		const { hours, minutes } = this.parseDeadlineTime(deadline);

		const deadlineTime = new Date();
		deadlineTime.setHours(hours, minutes, 0, 0);

		// If deadline already passed today, schedule for tomorrow
		if (now >= deadlineTime) {
			deadlineTime.setDate(deadlineTime.getDate() + 1);
		}

		return deadlineTime;
	}
}

export const deadlineHandler = new DeadlineHandler();
