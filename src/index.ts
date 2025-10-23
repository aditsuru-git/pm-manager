import { logger, startup, scheduler } from "@/utils";
import { githubService } from "@/services";

async function main() {
	logger.info("=".repeat(50));
	logger.info("Task Manager - Starting");
	logger.info("=".repeat(50));

	try {
		// Run startup sequence
		const schedule = await startup.run();

		// Get authenticated user
		const username = await githubService.getAuthenticatedUser();

		// Start scheduler
		scheduler.start(schedule, username);

		logger.info("=".repeat(50));
		logger.info("Task Manager - Running");
		logger.info("=".repeat(50));
		logger.info("Press Ctrl+C to stop");
	} catch (error) {
		logger.error({ error }, "Failed to start application");
		process.exit(1);
	}
}

// Graceful shutdown
process.on("SIGINT", () => {
	logger.info("Received SIGINT signal");
	logger.info("Shutting down gracefully...");

	scheduler.stop();

	logger.info("Shutdown complete");
	process.exit(0);
});

process.on("SIGTERM", () => {
	logger.info("Received SIGTERM signal");
	logger.info("Shutting down gracefully...");

	scheduler.stop();

	logger.info("Shutdown complete");
	process.exit(0);
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
	logger.error({ error }, "Uncaught exception");
	scheduler.stop();
	process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
	logger.error({ reason, promise }, "Unhandled rejection");
	scheduler.stop();
	process.exit(1);
});

// Start the application
main();
