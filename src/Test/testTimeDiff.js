const keywords = {
	TickTick_TAG: "#ticktick",
	DUE_DATE: "⏳|🗓️|📅|📆|🗓",
	// priorityIcons: "⏬|🔽|🔼|⏫|🔺",
	// priority: `\s([${priorityEmojis.toString()}])\s`
	priority: `\\s([\u{23EC}\u{1F53D}\u{1F53C}\u{23EB}\u{1F53A}])\\s`
};
const tag_regex = /(?<=\s)#[\w\d\u4e00-\u9fff\u0600-\u06ff\uac00-\ud7af-_/]+/g //Add -,_,/ as valid seperators.
// const due_date_regex = `(?<=(${keywords.DUE_DATE})\\s)(\\d{4}-\\d{2}-\\d{2})(\\s\\d{1,}:\\d{2})?`
const due_date_regex = `(${keywords.DUE_DATE})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`
const due_date_strip_regex = `[${keywords.DUE_DATE}]\\s\\d{4}-\\d{2}-\\d{2}(\\s\\d{1,}:\\d{2}|)`


const REGEX = {
	//hopefully tighter find.
	TickTick_TAG: new RegExp(`(?<=[ ;])${keywords.TickTick_TAG}+`, 'i'),
	TickTick_ID: /\[ticktick_id::\s*[\d\S]+\]/,
	TickTick_ID_NUM: /\[ticktick_id::\s*(.*?)\]/,
	TickTick_LINK: /\[link\]\(.*?\)/,
	DUE_DATE_WITH_EMOJ: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}`),
	// DUE_DATE : new RegExp(`(?:${keywords.DUE_DATE})\\s?(\\d{4}-\\d{2}-\\d{2})`),
	DUE_DATE: new RegExp(due_date_regex, 'gmu'),
	PROJECT_NAME: /\[project::\s*(.*?)\]/,
	TASK_CONTENT: {
		REMOVE_PRIORITY: /[🔺⏫🔼🔽⏬]/ug,
		//accommodate UTF-16 languages.
		REMOVE_TAGS: tag_regex,
		REMOVE_SPACE: /^\s+|\s+$/g,
		REMOVE_DATE: new RegExp(due_date_strip_regex),
		REMOVE_INLINE_METADATA: /%%\[\w+::\s*\w+\]%%/,
		REMOVE_CHECKBOX: /^(-|\*)\s+\[(x|X| )\]\s/,
		REMOVE_CHECKBOX_WITH_INDENTATION: /^([ \t]*)?(-|\*)\s+\[(x|X| )\]\s/,
		REMOVE_TickTick_LINK: /\[link\]\(.*?\)/,
	},
	//todo: this and remove_tags are redundant. Probably some of the other stuff to. Rationalize this lot.
	ALL_TAGS: tag_regex,
	TASK_CHECKBOX_CHECKED: /- \[(x|X)\] /,
	TASK_INDENTATION: /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/,
	TAB_INDENTATION: /^(\t+)/,
	// TASK_PRIORITY: /\s!!([1-4])\s/,
	TASK_PRIORITY: new RegExp(keywords.priority),
	priorityRegex: /^.*([🔺⏫🔼🔽⏬]).*$/u,
	BLANK_LINE: /^\s*$/,
	TickTick_EVENT_DATE: /(\d{4})-(\d{2})-(\d{2})/,
	ITEM_LINE: /\[(.*?)\]\s*(.*?)\s*%%(.*?)%%/
};




const lines = [
	// "- [ ] What happe== Added by TickTickSync -- 1.0.16 == \n",
	"- [ ] march 7 midnight  📅 2024-03-07 24:00",
	"- [ ] march 7 9 pm   📅 2024-03-07 22:00",
	"- [ ] march 7 6 pm   📅 2024-03-07 18:00",
	"- [ ] march 7 6 am   📅 2024-03-07 06:00",
	"- [ ] march 7   📅 2024-03-07",
	"- [ ] march 8   📅 2024-03-08",
	// "- [ ] step1  [link](https://ticktick.com/webapp/#p/659f01ea8f08f71333ebd026/tasks/65d0fb9a178b7b692052e0a1) #ticktick %%[ticktick_id:: 65d0fb9a178b7b692052e0a1]%% 📅 2024-02-05",

];
// lines.forEach(line => doStuff(line))

const lineTaskdate = "2024-03-24T08:00:00.000+-100"
const ticktickTaskDate = "2024-03-24T23:00:58.000+0900"
const thirdDate = "2024-03-24T20:00:00.000-1300"
const fourthDate = "2025-01-30T18:00:00+0000"
const dates = [
	// "2024-02-14T23:00:00+0000",
	// "2024-11-21T23:00:30+0000",
	// "2024-02-21T23:00:00+0000",
	// "2024-06-25T22:00:00+0000",
	// "2024-12-24T23:00:00+0000",
	// "2024-12-19T23:00:00+0000",
	// "2024-03-05T23:00:00+0000",
	// "2024-03-12T23:00:00+0000",
	// "2024-03-24T23:00:58+0000",
	// "2024-04-17T22:00:00+0000",
	// "2024-05-01T22:00:34+0000",
	// "2024-05-24T22:00:49+0000",
	// "2024-06-16T22:00:00+0000",
	// "2024-06-23T22:00:32+0000",
	// "2024-10-01T22:00:00+0000",
	// "2024-11-02T23:00:00+0000",
	// "2024-11-14T23:00:20+0000",
	"2025-01-28T23:00:03+0000",
	"2024-03-16T16:00:00.000+0000"
]

// toISO((lineTaskdate));
// toISO(ticktickTaskDate)
console.log(Intl.DateTimeFormat().resolvedOptions().timeZone);
dates.forEach(dateString => {
	console.log("----------");
	console.log(dateString,",",
		testForceFormat(dateString),
		formatDateToISO(new Date(dateString)),",",
		utcToLocal(dateString, true),",",
		utcToLocal(dateString, false));
	console.log("----------");
});

//

function doStuff(line) {
	try {
		console.log("Now: " ,formatDateToISO(new Date()));
		const dateStruct = getDueDateFromLineText(line);
		console.log("=====================\n");
	} catch (error) { 
		console.error("upd here", error);
	}
}

function getDueDateFromLineText(text) {
	console.log(text);
	// console.log('@@@ gddfl in: ', text);
	let isAllDay = true;
	const regEx = REGEX.DUE_DATE;
	let results = [...text.matchAll(regEx)];
	// console.log('@@@ Date parts from Regex: ', results);
	if (results.length == 0){
		const nullDate = "";
		const nullVal = ""
		return {isAllDay,nullDate, nullVal};
	}

	let result;
	if (results.length > 1) {
		//arbitrarily take the last one
		result = results[results.length -1]
	} else {
		result = results[0];
	}
	// for (const resultKey in result) {
	// 	console.log("@@@ ---", resultKey, result[resultKey]);
	// }
	let returnDate = null;
	if (result) {
		// console.log("String Date parts: ", result);
		if (!result[3]) {
			returnDate = `${result[2]}T00:00:00.000`
			isAllDay = true
		} else {
			returnDate = `${result[2]}T${result[3]}`
			isAllDay = false
		}
		// console.log("@@@ ReturnDate: ", isAllDay, result[2], returnDate);
		// console.log("@@@ date from date: ", new Date(returnDate))
		returnDate = formatDateToISO(new Date(returnDate));
		console.log("@@@@ ISO ReturnDate: ", returnDate);
	}
	const emoji = result[1];
	// console.log("@@@ Returning ", {isAllDay,returnDate, emoji});
	return {isAllDay,returnDate, emoji};

}
function isDueDateChanged(lineTask, TickTickTask) {
	const lineTaskDue = lineTask
	const TickTickTaskDue = TickTickTask ?? "";
	if (lineTaskDue === "" && TickTickTaskDue === "") {
		//console.log('No due date')
		return false;
	}
	console.log(lineTaskDue, TickTickTaskDue);

	if ((lineTaskDue || TickTickTaskDue) === "") {
		//console.log('due date has changed')
		return true;
	}

	if (lineTaskDue === TickTickTaskDue) {
		//console.log('due date consistent')
		return false;
	} else if (lineTaskDue.toString() === "Invalid Date" && TickTickTaskDue.toString() === "Invalid Date") {
		// console.log('invalid date')
		return false;
	} else {
		const date1 = cleanDate(lineTaskDue);
		const date2 = cleanDate(TickTickTaskDue);
		const date1TZ = date1.getTimezoneOffset();
		const date2TZ = date2.getTimezoneOffset();
		console.log("timeZones: ", date1TZ, date2TZ);

		const utcDate1 = new Date(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate(),date1.getUTCHours(), date1.getUTCMinutes(), date1.getUTCSeconds());
		const utcDate2 = new Date(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate(),date2.getUTCHours(), date2.getUTCMinutes(), date2.getUTCSeconds());
		console.log("dates: ", date1, "\t", date2);
		console.log("utc dates: ", utcDate1, "\t", utcDate2);
		if (utcDate1.getTime() === utcDate2.getTime()) {
			return false;
		} else {

			const date1TZ = utcDate1.getTimezoneOffset();
			const date2TZ = utcDate2.getTimezoneOffset();
			console.log("timeZones: ", date1TZ, date2TZ);
			// Calculate the difference in minutes
			const timeDifferenceInMilliseconds = Math.abs(utcDate2.getTime() - utcDate1.getTime());
			const days = Math.floor(timeDifferenceInMilliseconds / (1000 * 60 * 60 * 24));
			const hours = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const minutes = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60)) / (1000 * 60));
			console.log("diff - ", timeDifferenceInMilliseconds, days, hours, minutes);
			if (days > 0) {
				console.log(`The timestamps are ${days} days, ${hours} hours, and ${minutes} minutes apart.`);
			} else if (hours > 0) {
				console.log(`The timestamps are ${hours} hours and ${minutes} minutes apart.`);
			} else if (minutes > 0) {
				console.log(`The timestamps are ${minutes} minutes apart.`);
			} else {
				console.log(`The timestamps are different, but not calculatable..`);
			}

			return true;
		}
	}
}
function testForceFormat(utcDateString) {


	const date = new Date(utcDateString);

// Specify the locale as Asia/Irkutsk
	const locale = "ru-RU"; // Russian locale commonly used in Irkutsk

// Get the formatted date string in Asia/Irkutsk locale
	const irkutskDate = date.toLocaleDateString(locale);

	console.log(irkutskDate);

// 	const date = new Date(utcDateString);
//
// // Specify the desired time format for Asia/Irkutsk (e.g., 24-hour format)
// 	const timeFormat = '%H:%M:%S'; // 24-hour format
//
// // Create a timezone object for Asia/Irkutsk (UTC+08:00)
// 	const irkutskTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
//
// // Create a Date object in Asia/Irkutsk timezone
//
// 	let irkutskDate = date.toLocaleString('en-US', { timeZone: irkutskTimeZone })
//
// 	console.log("irkutskDate", irkutskDate);
// // Format the time according to the specified format
// 	const formattedTime = irkutskDate.toLocaleTimeString('en-US', {
// 		timeZone: irkutskTimeZone,
// 		hour12: false,
// 		hour: '2-digit',
// 		minute: '2-digit',
// 		second: '2-digit'
// 	});
//
// 	console.log(formattedTime);
}
function utcToLocal(utcDateString, bIsAllDay) {
	console.log("@@@ utc to local: ", utcDateString)
	const date = new Date(utcDateString);
	const locale = "en-US";
	const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
// Get the formatted date string in Asia/Irkutsk locale
	const localDate = date.toLocaleString(locale, {timeZone: hostTimeZone});
	// const localDate = date.toLocaleString();
	console.log("@@@ Local String: ", localDate);

	const [datePart, timePart] = localDate.split(', ');
	let [month, day, year] = datePart.split('/');
	month = String(month).padStart(2, '0');
	day = String(day).padStart(2, '0');
	let [hours, minutes] = timePart.split(':');
	if (localDate.includes('PM')) {
		hours = (Number(hours) + 12).toString();
	} else if ((localDate.includes('AM') && hours === '12')) {
		hours = '24';
	}
	hours = String(hours).padStart(2, '0');
	minutes = String(minutes).padStart(2, '0');
	if (!bIsAllDay) {
		console.log("@@@ utc to local returning: ", `${year}-${month}-${day} ${hours}:${minutes}`)
		return `${year}-${month}-${day} ${hours}:${minutes}`;
	} else {
		console.log("@@@ utc to local returning: ", `${year}-${month}-${day}`)
		return `${year}-${month}-${day}`;
	}
}
function oldutcToLocal(utcDateString, bIsAllDay) {
	const date = new Date(utcDateString);
	const localDate = date.toLocaleString();
	console.log("Local String: ", localDate);
	const [datePart, timePart] = localDate.split(', ');
	let [month, day, year] = datePart.split('/')
	month = String(month).padStart(2, '0')
	day = String(day).padStart(2, '0')
	let [hours, minutes] = timePart.split(':');
	if (localDate.includes("PM")) {
		hours = (Number(hours) + 12).toString();
	} else if ((localDate.includes("AM") && hours === "12")) {
		hours = "24";
	}
	hours = String(hours).padStart(2, '0');
	minutes = String(minutes).padStart(2, '0')
	if (!bIsAllDay) {
		return `${year}-${month}-${day} ${hours}:${minutes}`;
	} else {
		return `${year}-${month}-${day}`;
	}

}

function cleanDate(dateString) {

	if (dateString.includes('+-')) {
		dateString = dateString.replace('+-', '-');

		let regex = /(.*)([+-])(\d*)/;
		const matchTime = dateString.match(regex);
		if (matchTime[3].length < 4) {
			dateString = matchTime[1]+ '-0' + matchTime[3];
		}
	}
	const cleanedDate = new Date(dateString);
	return cleanedDate;
}

function formatDateToISO(dateTime) {
	// console.log("+++ inputdate: ", dateTime);
	// Check if the input is a valid date
	if (isNaN(dateTime.getTime())) {
		return "Invalid Date";
	}
	const tzoffset = dateTime.getTimezoneOffset()
	// console.log("+++ tz offset: ", tzoffset, tzoffset * 60000)
	const convertedDate = new Date(dateTime.getTime());
	// console.log("+++ convertedDate: ", convertedDate);
	const result = convertedDate.toISOString().replace(/Z$/, '+0000');
	// console.log("+++ ISO Date: ", result)

	return result;
}

// function parseDate(dateString) {
// 	const date = new Date(dateString);
// 	const hours = date.getHours();
// 	const minutes = date.getMinutes();
// 	const seconds = date.getSeconds();
// 	const timezone = date.getTimezoneOffset();
// 	return { hours, minutes, seconds, timezone };
// }
// const dateToClean = "2022-04-12T10:00:00.000+-200";
// const cleanedDate = cleanDate(dateToClean);
// console.log(cleanedDate);
//
// const parsedDate = parseDate(cleanedDate);
// console.log(parsedDate);
