import cron from "node-cron";
import schedule from "node-schedule";
import { deadlineHandler } from "@/core/deadlineHandler";
import { bulkIssueCreator } from "@/utils/bulkIssueCreator";
import { logger } from "@/utils";
import type { ScheduleConfig } from "@/services";

export class Scheduler {
	private deadlineJobs: schedule.Job[] = [];
	private midnightJob: cron.ScheduledTask | null = null;

	private parseDeadlineTime(deadline: string): { hour: number; minute: number } {
		const [hour, minute] = deadline.split(":").map(Number);
		return { hour, minute };
	}

	scheduleDeadlineChecks(scheduleConfig: ScheduleConfig, assignee?: string): void {
		logger.info("Scheduling deadline checks");

		for (const task of scheduleConfig.tasks) {
			const { hour, minute } = this.parseDeadlineTime(task.deadline);

			// Schedule exact time for this category's deadline
			const rule = new schedule.RecurrenceRule();
			rule.hour = hour;
			rule.minute = minute;
			rule.second = 0;

			const job = schedule.scheduleJob(rule, async () => {
				logger.info({ category: task.category, deadline: task.deadline }, "Deadline check triggered");

				try {
					await deadlineHandler.processDeadlineForCategory(task.category, task.deadline);
				} catch (error) {
					logger.error({ category: task.category, error }, "Deadline processing failed");
				}
			});

			this.deadlineJobs.push(job);

			logger.info({ category: task.category, time: task.deadline }, "Deadline check scheduled");
		}
	}

	scheduleMidnightIssueCreation(scheduleConfig: ScheduleConfig, assignee?: string): void {
		logger.info("Scheduling midnight issue creation");

		// Run at 00:00 every day
		this.midnightJob = cron.schedule("0 0 * * *", async () => {
			logger.info("Midnight job triggered - creating today's issues");

			try {
				await bulkIssueCreator.createTodaysIssues(scheduleConfig, assignee);
			} catch (error) {
				logger.error({ error }, "Midnight issue creation failed");
			}
		});

		logger.info("Midnight job scheduled");
	}

	start(scheduleConfig: ScheduleConfig, assignee?: string): void {
		logger.info("Starting scheduler");

		this.scheduleDeadlineChecks(scheduleConfig, assignee);
		this.scheduleMidnightIssueCreation(scheduleConfig, assignee);

		logger.info(
			{
				deadlineJobs: this.deadlineJobs.length,
				midnightJob: this.midnightJob ? "scheduled" : "not scheduled",
			},
			"Scheduler started"
		);
	}

	stop(): void {
		logger.info("Stopping scheduler");

		// Cancel all deadline jobs
		for (const job of this.deadlineJobs) {
			job.cancel();
		}
		this.deadlineJobs = [];

		// Stop midnight job
		if (this.midnightJob) {
			this.midnightJob.stop();
			this.midnightJob = null;
		}

		logger.info("Scheduler stopped");
	}
}

export const scheduler = new Scheduler();
