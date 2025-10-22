import fs from "fs";
import path from "path";

interface LocalIssueState {
	category: string;
	deadline: string; // ISO8601 with timezone
	lastCreatedDate: string; // YYYY-MM-DD
	recurrence: {
		days: string[];
	};
	expiredAsPerDeadline: boolean;
}

interface LocalAppState {
	issues: Record<string, LocalIssueState>; // category → metadata
}

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
		const fileContent = JSON.stringify(state);
		fs.writeFileSync(this.filePath, fileContent);
	}

	// Helper methods
	createIssuesForToday(): string[] {
		const localState = this.load();
		const issues = localState.issues;
		const issuesToCreate: string[] = [];
		const todayDate = new Date();
		const todayDateString = todayDate.toISOString().split("T")[0];
		Object.keys(issues).forEach((key) => {
			if (issues[key]?.lastCreatedDate != todayDateString) issuesToCreate.push(key);
		});

		return issuesToCreate;
	}

	markIssuesCreated(issues: string[]): void {
		const localIssues = this.load().issues;
		const todayDate = new Date();
		const todayDateString = todayDate.toISOString().split("T")[0] as string;
		issues.forEach((item) => {
			if (localIssues[item]) {
				localIssues[item].lastCreatedDate = todayDateString;
			}
		});
	}

	toggleIssueExpired(issues: string[]): void {
		const localIssues = this.load().issues;
		issues.forEach((item) => {
			if (localIssues[item]) {
				localIssues[item].expiredAsPerDeadline = !localIssues[item].expiredAsPerDeadline;
			}
		});
	}
}

export const localStateServiceClient = new LocalStateService();
