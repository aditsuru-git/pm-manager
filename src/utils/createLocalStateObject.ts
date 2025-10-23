import { loadSchedule, type LocalAppState } from "@/services";

export function createLocalStateObject() {
	const schedule = loadSchedule();

	const localStateObject: LocalAppState = [];
	const todayDate = new Date();
	const yesterday = new Date(todayDate);
	yesterday.setDate(todayDate.getDate() - 1);

	const yesterdayDateString = yesterday.toISOString().split("T")[0];
	schedule?.tasks.forEach((item) =>
		localStateObject.push({
			category: item.category,
			expiredAsPerDeadline: false,
			lastCreatedDate: yesterdayDateString as string,
			deadline: item.deadline,
			days: item.recurrence.days,
		})
	);

	return localStateObject;
}
