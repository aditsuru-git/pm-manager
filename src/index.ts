import { logger, createLocalStateObject } from "@/utils";
import { config } from "@/config";
import { loadSchedule, localStateServiceClient, githubServiceClient } from "@/services";

async function main() {
	logger.info("Starting services...");
	const localStateObject = createLocalStateObject();

	localStateServiceClient.save(localStateObject);
	const todayIssuesLeftForCreation = localStateServiceClient.createIssuesForToday();

	if (todayIssuesLeftForCreation) {
	}

	// launch cron job which checks issue creation every 12 hours, new issues are only create every day
	// launch deadline checker cron job OR event at exact deadlines
}
