const text = [
	"Line 1 ❌ 2024-04-05",
	"Line 2 ⏳ 2023-12-15 13:37",
	"Line 3 🛫 2024-01-01",
	"Line 4 📅 2024-02-29 ",
	"Line 5 ✅ 2024-03-10 10:15",
	"Line 6 ➕ 2023-11-22",
]


function stripDates(inString) {
	// let stripRegEx = /[➕⏳🛫📅✅❌]\s((\d{4}-\d{2}-\d{2})|)\s(\d{1,}:\d{2}|)/usg;
	let stripRegEx = /[➕⏳🛫📅✅❌]\s(\d{4}-\d{2}-\d{2})(\s\d{1,}:\d{2})?/gus;
	const dates = inString.match(stripRegEx);
	if (dates) {
		dates.forEach(date => {
			console.log("\t" + date);})
	}
	const retString = inString.replace(stripRegEx, '');
	return retString;
}


text.forEach(line => {
	console.log("Line:  [" + line + "]");
	console.log("result [", stripDates(line), "]");
})

