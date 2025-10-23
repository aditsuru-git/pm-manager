import fs from "fs";
import path from "path";

export interface LocalIssueState {
	category: string;
	deadline: string;
	lastCreatedDate: string;
	days: string[];
	expiredAsPerDeadline: boolean;
}

export type LocalAppState = LocalIssueState[];

class LocalStateService {
	private filePath: string;

	constructor() {
		this.filePath = path.resolve("data", "state.json");
	}

	load(): LocalAppState {
		const fileContent = fs.readFileSync(this.filePath, { encoding: "utf8" });
		return JSON.parse(fileContent) as LocalAppState;
	}

	save(state: LocalAppState): void {
		const fileContent = JSON.stringify(state, null, 2);
		fs.writeFileSync(this.filePath, fileContent);
	}

	// Helper methods
	createIssuesForToday(): string[] {
		const localState = this.load();
		const issuesToCreate: string[] = [];
		const todayDate = new Date();
		const todayDateString = todayDate.toISOString().split("T")[0];

		localState.forEach((issue) => {
			if (issue.lastCreatedDate !== todayDateString) {
				issuesToCreate.push(issue.category);
			}
		});

		return issuesToCreate;
	}

	markIssuesCreated(categories: string[]): void {
		const localState = this.load();
		const todayDate = new Date();
		const todayDateString = todayDate.toISOString().split("T")[0];

		localState.forEach((issue) => {
			if (categories.includes(issue.category)) {
				issue.lastCreatedDate = todayDateString as string;
			}
		});

		this.save(localState);
	}

	toggleIssueExpired(categories: string[]): void {
		const localState = this.load();

		localState.forEach((issue) => {
			if (categories.includes(issue.category)) {
				issue.expiredAsPerDeadline = !issue.expiredAsPerDeadline;
			}
		});

		this.save(localState);
	}
}

export const localStateServiceClient = new LocalStateService();
