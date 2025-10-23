import fs from "fs";
import path from "path";
import { logger } from "@/utils";

export interface LocalIssueState {
	category: string;
	deadline: string; // HH:MM format
	lastCreatedDate: string | null; // YYYY-MM-DD or null
	deadlineProcessedDate: string | null; // YYYY-MM-DD or null
}

export type LocalAppState = LocalIssueState[];

class StateService {
	private filePath: string;

	constructor() {
		this.filePath = path.resolve("data", "state.json");
	}

	load(): LocalAppState {
		try {
			if (!fs.existsSync(this.filePath)) {
				logger.warn("State file not found, returning empty state");
				return [];
			}

			const fileContent = fs.readFileSync(this.filePath, { encoding: "utf8" });
			return JSON.parse(fileContent) as LocalAppState;
		} catch (error) {
			logger.error({ error }, "Failed to load state file");
			return [];
		}
	}

	save(state: LocalAppState): void {
		try {
			const dir = path.dirname(this.filePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			const fileContent = JSON.stringify(state, null, 2);
			fs.writeFileSync(this.filePath, fileContent);
			logger.debug("State saved successfully");
		} catch (error) {
			logger.error({ error }, "Failed to save state file");
			throw error;
		}
	}

	getByCategory(category: string): LocalIssueState | null {
		const state = this.load();
		return state.find((item) => item.category === category) || null;
	}

	updateCategory(category: string, updates: Partial<LocalIssueState>): void {
		const state = this.load();
		const index = state.findIndex((item) => item.category === category);

		if (index === -1) {
			logger.warn({ category }, "Category not found in state");
			return;
		}

		state[index] = { ...state[index], ...updates };
		this.save(state);
	}

	markIssueCreated(category: string, date: string): void {
		this.updateCategory(category, { lastCreatedDate: date });
	}

	markDeadlineProcessed(category: string, date: string): void {
		this.updateCategory(category, { deadlineProcessedDate: date });
	}

	needsIssueCreation(category: string, date: string): boolean {
		const item = this.getByCategory(category);
		if (!item) return true;
		return item.lastCreatedDate !== date;
	}

	needsDeadlineProcessing(category: string, date: string): boolean {
		const item = this.getByCategory(category);
		if (!item) return false;
		return item.deadlineProcessedDate !== date;
	}
}

export const stateService = new StateService();
