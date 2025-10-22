import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { logger } from "@/utils";
import { z, prettifyError } from "zod";

const TaskSchema = z.object({
	name: z.string(),
	category: z.string(),
	recurrence: z.object({
		days: z.union([z.array(z.string()), z.literal("daily")]),
	}),
	deadline: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM format"),
	description: z.string(),
});

const ScheduleSchema = z.object({
	repo: z.string(),
	timezone: z.string(),
	tasks: z.array(TaskSchema).refine(
		(tasks) => {
			const categories = tasks.map((task) => task.category);
			const uniqueCategories = new Set(categories);
			return uniqueCategories.size === categories.length;
		},
		{
			message: "Each task category must be unique",
			path: ["tasks"],
		}
	),
});

export type ScheduleConfig = z.infer<typeof ScheduleSchema>;

export function loadSchedule(): ScheduleConfig | null {
	const schedulePath = path.resolve("schedule.yaml");

	try {
		const fileContents = fs.readFileSync(schedulePath, "utf8");
		const data = yaml.load(fileContents) as ScheduleConfig;
		return ScheduleSchema.parse(data);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const prettyError = prettifyError(error);
			logger.error({ error: prettyError }, "Validation failed for schedule.yaml");
		} else {
			logger.error({ error }, `Error reading ${schedulePath}`);
		}
		process.exit(1);
	}
}
