import { Octokit } from "octokit";
import { config } from "@/config";
import { logger } from "@/utils";

class GitHubService {
	private octokit: Octokit;
	private owner: string;
	private repo: string;

	constructor() {
		this.octokit = new Octokit({ auth: config.GITHUB_PAT });
		const [owner, repo] = config.GITHUB_REPO.split("/");
		this.owner = owner as string;
		this.repo = repo as string;
	}

	private async apiCall<T>(fn: () => Promise<T>): Promise<T> {
		try {
			return await fn();
		} catch (err: any) {
			if (err.status === 401) {
				console.error("Authentication failed (401)");
				process.exit(1);
			} else if (err.status === 403) {
				console.error("API rate limit exceeded (403)");
				process.exit(1);
			} else if (err.status === 404) {
				console.error("Repository not found (404)");
				process.exit(1);
			} else {
				console.warn("Network error, retrying once...");
				try {
					return await fn();
				} catch {
					console.error("Network error, exiting.");
					process.exit(1);
				}
			}
		}
	}

	// Label operations
	async labelExists(name: string): Promise<boolean> {
		return this.apiCall(async () => {
			try {
				await this.octokit.rest.issues.getLabel({
					owner: this.owner,
					repo: this.repo,
					name,
				});
				return true;
			} catch (err: any) {
				if (err.status === 404) return false;
				throw err;
			}
		});
	}

	async createLabel(name: string, color: string): Promise<void> {
		if (await this.labelExists(name)) return;
		await this.apiCall(() =>
			this.octokit.rest.issues.createLabel({
				owner: this.owner,
				repo: this.repo,
				name,
				color,
			})
		);
	}

	// Issue operations
	async createIssue(params: { title: string; body: string; labels: string[]; assignees: string[] }): Promise<number> {
		if (!params.labels.includes("pm-managed")) params.labels.push("pm-managed");

		const { data } = await this.apiCall(() =>
			this.octokit.rest.issues.create({
				owner: this.owner,
				repo: this.repo,
				...params,
			})
		);
		return data.number;
	}

	async closeIssue(issueNumber: number): Promise<void> {
		await this.apiCall(() =>
			this.octokit.rest.issues.update({
				owner: this.owner,
				repo: this.repo,
				issue_number: issueNumber,
				state: "closed",
			})
		);
	}

	async addLabels(issueNumber: number, labels: string[]): Promise<void> {
		if (!labels.includes("pm-managed")) labels.push("pm-managed");

		await this.apiCall(() =>
			this.octokit.rest.issues.addLabels({
				owner: this.owner,
				repo: this.repo,
				issue_number: issueNumber,
				labels,
			})
		);
	}

	async getOpenIssuesByLabel(label: string): Promise<IssueData[]> {
		const { data } = await this.apiCall(() =>
			this.octokit.rest.issues.listForRepo({
				owner: this.owner,
				repo: this.repo,
				state: "open",
				labels: `pm-managed,${label}`,
			})
		);
		return data as IssueData[];
	}

	async getClosedIssuesByLabel(label: string): Promise<IssueData[]> {
		const { data } = await this.apiCall(() =>
			this.octokit.rest.issues.listForRepo({
				owner: this.owner,
				repo: this.repo,
				state: "closed",
				labels: `pm-managed,${label}`,
			})
		);
		return data as IssueData[];
	}

	// Board operations using GraphQL API (Projects v2)
	async createKanbanBoard(name: string): Promise<void> {
		const repoQuery = `
			query($owner: String!, $repo: String!) {
				repository(owner: $owner, name: $repo) {
					id
				}
			}
		`;

		const repoData: any = await this.apiCall(() =>
			this.octokit.graphql(repoQuery, {
				owner: this.owner,
				repo: this.repo,
			})
		);

		const repositoryId = repoData.repository.id;

		const createProjectMutation = `
			mutation($repositoryId: ID!, $title: String!) {
				createProjectV2(input: {repositoryId: $repositoryId, title: $title}) {
					projectV2 {
						id
					}
				}
			}
		`;

		const projectData: any = await this.apiCall(() =>
			this.octokit.graphql(createProjectMutation, {
				repositoryId: repositoryId,
				title: name,
			})
		);

		const projectId = projectData.createProjectV2.projectV2.id;

		const getFieldsQuery = `
			query($projectId: ID!) {
				node(id: $projectId) {
					... on ProjectV2 {
						fields(first: 20) {
							nodes {
								... on ProjectV2SingleSelectField {
									id
									name
									options {
										id
										name
									}
								}
							}
						}
					}
				}
			}
		`;

		const fieldsData: any = await this.apiCall(() =>
			this.octokit.graphql(getFieldsQuery, {
				projectId: projectId,
			})
		);

		const statusField = fieldsData.node.fields.nodes.find((field: any) => field.name === "Status");

		let readyOptionId: string;
		let doneOptionId: string;

		if (statusField) {
			const updateFieldMutation = `
				mutation($projectId: ID!, $fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
					updateProjectV2Field(input: {projectId: $projectId, fieldId: $fieldId, singleSelectOptions: $options}) {
						projectV2Field {
							... on ProjectV2SingleSelectField {
								id
								options {
									id
									name
								}
							}
						}
					}
				}
			`;

			const updateResult: any = await this.apiCall(() =>
				this.octokit.graphql(updateFieldMutation, {
					projectId: projectId,
					fieldId: statusField.id,
					options: [
						{ name: "Ready", color: "GRAY" },
						{ name: "In Progress", color: "YELLOW" },
						{ name: "Done", color: "GREEN" },
					],
				})
			);

			const options = updateResult.updateProjectV2Field.projectV2Field.options;
			readyOptionId = options.find((opt: any) => opt.name === "Ready").id;
			doneOptionId = options.find((opt: any) => opt.name === "Done").id;

			const createWorkflowMutation = `
				mutation($input: CreateProjectV2WorkflowInput!) {
					createProjectV2Workflow(input: $input) {
						projectV2Workflow {
							id
						}
					}
				}
			`;

			await this.apiCall(() =>
				this.octokit.graphql(createWorkflowMutation, {
					input: {
						projectId: projectId,
						name: "Auto-add issues to project",
						enabled: true,
						triggers: [
							{
								event: "ISSUE_CREATED",
							},
						],
						actions: [
							{
								addToProject: {
									projectId: projectId,
								},
							},
							{
								setFieldValue: {
									fieldId: statusField.id,
									value: {
										singleSelectOptionId: readyOptionId,
									},
								},
							},
						],
					},
				})
			);

			await this.apiCall(() =>
				this.octokit.graphql(createWorkflowMutation, {
					input: {
						projectId: projectId,
						name: "Auto-move closed issues to Done",
						enabled: true,
						triggers: [
							{
								event: "ISSUE_CLOSED",
							},
						],
						actions: [
							{
								setFieldValue: {
									fieldId: statusField.id,
									value: {
										singleSelectOptionId: doneOptionId,
									},
								},
							},
						],
					},
				})
			);
		}

		logger.info(`Kanban board '${name}' created with columns: Ready, In Progress, Done`);
	}

	async getAuthenticatedUser(): Promise<string> {
		const { data } = await this.apiCall(() => this.octokit.rest.users.getAuthenticated());
		return data.login;
	}
}

export interface IssueData {
	number: number;
	title: string;
	body: string;
	labels: string[];
	state: "open" | "closed";
}

export const githubServiceClient = new GitHubService();
