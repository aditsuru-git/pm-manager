import pino from "pino";
import { config } from "@/config";

// Create logger — only logs to console
const destination = config.isDev
	? pino.transport({
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:standard",
				ignore: "pid,hostname",
			},
	  })
	: process.stdout;

// Logger instance
export const logger = pino(
	{
		level: config.LOG_LEVEL || "info",
	},
	destination
);
