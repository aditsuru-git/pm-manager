import * as z from "zod";
import "dotenv/config";

export enum NodeEnv {
	Development = "development",
	Production = "production",
	Test = "test",
}

const EnvSchema = z
	.object({
		// Pino Logger
		LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

		// GitHub
		GITHUB_PAT: z.string().min(1, "GITHUB_PAT is required and cannot be empty"),
		GITHUB_REPO: z.string().min(1, "GITHUB_PAT is required and cannot be empty"),

		// Runtime environment
		NODE_ENV: z.enum(NodeEnv).default(NodeEnv.Development),
	})
	.transform((env) => ({
		...env,

		isDev: env.NODE_ENV === NodeEnv.Development,
	}));

// Validate process.env
const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
	console.error("Invalid environment configuration:");
	console.error(z.prettifyError(parsedEnv.error));
	process.exit(1);
}

const config = parsedEnv.data;

export { config };
