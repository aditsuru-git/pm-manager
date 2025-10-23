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
				logger.error("Authentication failed (401)");
				process.exit(1);
			} else if (err.status === 403) {
				logger.error("API rate limit exceeded (403)");
				process.exit(1);
			} else if (err.status === 404) {
				logger.error("Repository not found (404)");
				process.exit(1);
			} else {
				logger.warn("Network error, retrying once...");
				try {
					return await fn();
				} catch {
					logger.error("Network error after retry, exiting");
					process.exit(1);
				}
			}
		}
	}

	async getAuthenticatedUser(): Promise<string> {
		const { data } = await this.apiCall(() => this.octokit.rest.users.getAuthenticated());
		return data.login;
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
		if (await this.labelExists(name)) {
			logger.debug({ label: name }, "Label already exists");
			return;
		}

		await this.apiCall(() =>
			this.octokit.rest.issues.createLabel({
				owner: this.owner,
				repo: this.repo,
				name,
				color,
			})
		);

		logger.info({ label: name }, "Label created");
	}

	async addLabels(issueNumber: number, labels: string[]): Promise<void> {
		if (!labels.includes("pm-managed")) {
			labels.push("pm-managed");
		}

		await this.apiCall(() =>
			this.octokit.rest.issues.addLabels({
				owner: this.owner,
				repo: this.repo,
				issue_number: issueNumber,
				labels,
			})
		);
	}

	async removeLabel(issueNumber: number, label: string): Promise<void> {
		await this.apiCall(() =>
			this.octokit.rest.issues.removeLabel({
				owner: this.owner,
				repo: this.repo,
				issue_number: issueNumber,
				name: label,
			})
		);

		logger.debug({ issueNumber, label }, "Label removed");
	}

	// Issue operations
	async createIssue(params: { title: string; body: string; labels: string[]; assignees?: string[] }): Promise<number> {
		if (!params.labels.includes("pm-managed")) {
			params.labels.push("pm-managed");
		}

		const { data } = await this.apiCall(() =>
			this.octokit.rest.issues.create({
				owner: this.owner,
				repo: this.repo,
				title: params.title,
				body: params.body,
				labels: params.labels,
				assignees: params.assignees || [],
			})
		);

		logger.info({ issueNumber: data.number, title: params.title }, "Issue created");
		return data.number;
	}

	async updateIssueBody(issueNumber: number, body: string): Promise<void> {
		await this.apiCall(() =>
			this.octokit.rest.issues.update({
				owner: this.owner,
				repo: this.repo,
				issue_number: issueNumber,
				body,
			})
		);

		logger.info({ issueNumber }, "Issue body updated");
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

		logger.info({ issueNumber }, "Issue closed");
	}

	async getIssuesByLabels(labels: string[], state: "open" | "closed" | "all" = "all"): Promise<IssueData[]> {
		if (!labels.includes("pm-managed")) {
			labels.push("pm-managed");
		}

		const { data } = await this.apiCall(() =>
			this.octokit.rest.issues.listForRepo({
				owner: this.owner,
				repo: this.repo,
				state,
				labels: labels.join(","),
				per_page: 100,
			})
		);

		return data.map((issue) => ({
			number: issue.number,
			title: issue.title,
			body: issue.body || "",
			labels: issue.labels.map((label) => (typeof label === "string" ? label : label.name || "")),
			state: issue.state as "open" | "closed",
			createdAt: issue.created_at,
		}));
	}

	// Board operations
	async kanbanBoardExists(name: string): Promise<boolean> {
		try {
			const repoQuery = `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            projectsV2(first: 20) {
              nodes {
                title
              }
            }
          }
        }
      `;

			const data: any = await this.apiCall(() =>
				this.octokit.graphql(repoQuery, {
					owner: this.owner,
					repo: this.repo,
				})
			);

			const projects = data.repository.projectsV2.nodes;
			return projects.some((project: any) => project.title === name);
		} catch (error) {
			logger.error({ error }, "Error checking kanban board existence");
			return false;
		}
	}

	async createKanbanBoard(name: string): Promise<void> {
		if (await this.kanbanBoardExists(name)) {
			logger.info({ boardName: name }, "Kanban board already exists");
			return;
		}

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

		if (!statusField) {
			logger.error("Status field not found in project");
			return;
		}

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
		const readyOptionId = options.find((opt: any) => opt.name === "Ready").id;
		const doneOptionId = options.find((opt: any) => opt.name === "Done").id;

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
					triggers: [{ event: "ISSUE_CREATED" }],
					actions: [
						{ addToProject: { projectId: projectId } },
						{
							setFieldValue: {
								fieldId: statusField.id,
								value: { singleSelectOptionId: readyOptionId },
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
					triggers: [{ event: "ISSUE_CLOSED" }],
					actions: [
						{
							setFieldValue: {
								fieldId: statusField.id,
								value: { singleSelectOptionId: doneOptionId },
							},
						},
					],
				},
			})
		);

		logger.info({ boardName: name }, "Kanban board created with workflows");
	}
}

export interface IssueData {
	number: number;
	title: string;
	body: string;
	labels: string[];
	state: "open" | "closed";
	createdAt: string;
}

export const githubService = new GitHubService();
