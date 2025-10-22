import * as z from "zod";
import "dotenv/config";

const EnvSchema = z.object({
	// Pino Logger
	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

	// GitHub PAT
	GITHUB_PAT: z.string().min(1, "GITHUB_PAT is required and cannot be empty"),
});

// Validate process.env
const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
	console.error("Invalid environment configuration:");
	console.error(z.prettifyError(parsedEnv.error));
	process.exit(1);
}

const config = parsedEnv.data;

export { config };
