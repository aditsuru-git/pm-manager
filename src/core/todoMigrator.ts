import { githubService } from "@/services";
import { logger } from "@/utils";

export class TodoMigrator {
	parseUncheckedTodos(issueBody: string): string[] {
		const uncheckedTodos: string[] = [];
		const lines = issueBody.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			// Match unchecked checkboxes: - [ ] or * [ ] or + [ ]
			if (/^[-*+]\s*\[\s*\]\s*.+/.test(trimmed)) {
				// Extract the todo text after the checkbox
				const todoText = trimmed.replace(/^[-*+]\s*\[\s*\]\s*/, "").trim();
				if (todoText) {
					uncheckedTodos.push(todoText);
				}
			}
		}

		return uncheckedTodos;
	}

	hasUncheckedTodos(issueBody: string): boolean {
		return this.parseUncheckedTodos(issueBody).length > 0;
	}

	async getIncompleteTodosForCategory(category: string): Promise<string[]> {
		const issues = await githubService.getIssuesByLabels([category, "incomplete"], "closed");

		const allTodos: string[] = [];
		for (const issue of issues) {
			const todos = this.parseUncheckedTodos(issue.body);
			allTodos.push(...todos);
		}

		logger.info({ category, issueCount: issues.length, todoCount: allTodos.length }, "Extracted incomplete todos");

		return allTodos;
	}

	async cleanupIncompleteLabelForCategory(category: string): Promise<void> {
		const issues = await githubService.getIssuesByLabels([category, "incomplete"], "closed");

		for (const issue of issues) {
			// Remove incomplete label by getting all labels except "incomplete"
			issue.labels.filter((label) => label !== "incomplete");

			// GitHub API doesn't have a "remove label" that preserves others easily,
			// so we need to remove the label via DELETE endpoint
			try {
				await githubService.removeLabel(issue.number, "incomplete");
				logger.debug({ issueNumber: issue.number }, "Removed incomplete label");
			} catch (error) {
				logger.warn({ issueNumber: issue.number, error }, "Failed to remove incomplete label");
			}
		}

		logger.info({ category, count: issues.length }, "Cleaned up incomplete labels");
	}

	formatMigratedTodos(todos: string[]): string {
		if (todos.length === 0) return "";

		const formatted = todos.map((todo) => `- [ ] ${todo}`).join("\n");
		return `\n\n## Migrated from previous day\n${formatted}`;
	}
}

export const todoMigrator = new TodoMigrator();
