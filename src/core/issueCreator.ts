import { githubService } from "@/services";
import { todoMigrator } from "@/core";
import { logger } from "@/utils";

export interface CreateIssueParams {
	category: string;
	name: string;
	description: string;
	deadline: string;
	assignee?: string;
}

export class IssueCreator {
	private formatDeadline(deadline: string): string {
		const today = new Date();
		const dateStr = today.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		});
		return `${dateStr} at ${deadline}`;
	}

	private buildIssueBody(description: string, deadline: string, migratedTodos: string[]): string {
		let body = description;

		body += `\n\n---\n**⏰ Deadline:** ${this.formatDeadline(deadline)}`;

		if (migratedTodos.length > 0) {
			body += todoMigrator.formatMigratedTodos(migratedTodos);
		}

		return body;
	}

	async createIssue(params: CreateIssueParams, migratedTodos: string[] = []): Promise<number> {
		const body = this.buildIssueBody(params.description, params.deadline, migratedTodos);

		const assignees = params.assignee ? [params.assignee] : [];

		const issueNumber = await githubService.createIssue({
			title: params.name,
			body,
			labels: [params.category],
			assignees,
		});

		logger.info(
			{
				issueNumber,
				category: params.category,
				migratedCount: migratedTodos.length,
			},
			"Issue created with migrated todos"
		);

		return issueNumber;
	}

	async createIssueWithMigration(params: CreateIssueParams): Promise<number> {
		// Get incomplete todos from previous issues
		const migratedTodos = await todoMigrator.getIncompleteTodosForCategory(params.category);

		// Create the issue with migrated todos
		const issueNumber = await this.createIssue(params, migratedTodos);

		// Cleanup incomplete labels from old issues
		if (migratedTodos.length > 0) {
			await todoMigrator.cleanupIncompleteLabelForCategory(params.category);
		}

		return issueNumber;
	}
}

export const issueCreator = new IssueCreator();
