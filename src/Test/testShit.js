 let testStr = ["- [ ] created_date: ➕ 2023-04-01 15:00 scheduled_date: ⏳ 2024-04-02 16:00 " +
 "start_date: 🛫 2024-05-03 due_date: 📅 2024-05-04 done_date: ✅ 2024-05-06 18:00 " +
 "cancelled_date: ❌ 2025-01-01 19:00"]
// 	"- [ ] Task there 📅 2024-05-05 stuff at the end #foo",
// 	"- [ ] Task there 🛫 2024-05-05 📅 2024-05-05 stuff at the end #foo",
// 	"- [ ] Task there ❌ 2024-05-05 ✅ 2024-05-05 stuff at the end #foo"]
const date_emoji = {
	created_date: '➕',
	scheduled_date: '⏳',
	start_date: '🛫',
	due_date: '📅',
	done_date: '✅',
	cancelled_date: '❌'
};

function dealWith(inString, dateEmojiKey, dateEmojiElement, dateArray) {
	const date_regex =      `(${dateEmojiElement})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;
	const date_strip_regex = `[${dateEmojiElement}]\\s\\d{4}-\\d{2}-\\d{2}(\\s\\d{1,}:\\d{2}|)`;

	let foundStuff = inString.match(date_regex)
	if (foundStuff) {
		dateArray.push({key: dateEmojiKey, emoji: foundStuff[1], date: foundStuff[2], time: foundStuff[3]});
		inString = inString.replace(foundStuff[0], "");
	}
	return	inString;

}

function doTheStrings(inString)
{
	let dateArray = []
	for (let dateEmojiKey in date_emoji) {
		// console.log("--", dateEmojiKey, date_emoji[dateEmojiKey]);
		inString = dealWith(inString, dateEmojiKey, date_emoji[dateEmojiKey], dateArray);
	}
	// console.log("str: ", inString);
	// console.log("got: ", dateArray);
	if (dateArray.length > 0) {
		dateArray.forEach(dateThing => {
			if (dateThing.time) {
				inString = inString + " " + dateThing.emoji + " " + dateThing.time;
			}
		})
		dateArray.forEach(dateThing => {
			inString = inString + " " + dateThing.emoji + " " + dateThing.date;
		})
	}
	return inString

}
testStr.forEach(oneStr => {
	console.log("\n----\nb: ", oneStr);
	const stringRes = doTheStrings(oneStr)
	console.log("a: ", stringRes);
})

//
// const regex = /%%[^\[](.*?)[^\]]%%/g;
// const str = `[ ] a task [link](https://ticktick.com/webapp/#p/65aadb148f08622ab0506b5a/tasks/661183ccca1d396417db81d6) #ticktick %%[ticktick_id:: 661183ccca1d396417db81d6]%%
// 	[ ] an tieme %%661183d1ca1d396417db81d8%% [link](https://ticktick.com/webapp/#p/65aadb148f08622ab0506b5a/tasks/6611840aca1d396417db81db) #ticktick %%[ticktick_id:: 6611840aca1d396417db81db]%%
// 	[ ] andother %%661183d4ca1d396417db81d9%% [link](https://ticktick.com/webapp/#p/65aadb148f08622ab0506b5a/tasks/6611840aca1d396417db81dd) #ticktick %%[ticktick_id:: 6611840aca1d396417db81dd]%%
// 		[ ] try again %%[ticktick_id:: 6611840aca1d396417db81dd]%% %%661184b291d84c6417a860fa%% #ticktick
// 		[ ] and again %%661184b491d84c6417a860fb%% #ticktick`;
//
// let m;
// while ((m = regex.exec(str)) !== null) {
// 	console.log(m[1]);
// }



//
// async function doTheThing() {
// 	// var request = require('request');
// 	const { requestUrl } = require('obsidian');
//
// 	var options = {
// 		'method': 'GET',
// 		'url': 'https://api.ticktick.com/api/v2/batch/check/0',
// 		'headers': {
// 			't': '154BB8FE91446783C736C5DD8D2ECD7B209F61AC65D1FA167D4F994AFC5CC82BA484CBF50C7C8FCB249935528599536591AF328B753235AE08F2C8F3D4B29722CB39D2DA703BFC90D4A721B29989A984B2AA1C6BB7A5012710ED8EEFCEA86F2782BEE463B1431075BC4DD36207DCA5A8B2AA1C6BB7A501274CCE46E1C3BF4066DD7AA2F0D7907F391537B521884EF06E42C696B9F7F2F8F1710BADDD6AC6A9E9441259BAE0414AF2',
// 			'Cookie': 't=154BB8FE914467831778BAB66DD40D243065788330CD84D883F45F614CE605C8063299518DA7C7FE2EDB4326BD2F6F568AF50C0EC428BDFCC4DF513F39334C5216D0A39676247F5E4A1B5F5DA273AD2DEDFF91500E3428B4286A022FD0260ECF82BEE463B1431075BC4DD36207DCA5A8EDFF91500E3428B42F066C31584C72B9D5CEB4026B93FA00034645F5A647A51D69F79B085F322C972E41D3F5B95B28DE7353686E6CEE8A83; ' +
// 				'AWSALB=zdooyvystUqK1pr50QsK3GQuaTvYKu/IYRrJ/5r9mJofFJ2ldKtwobl5Y2Z4q9ZzldLafsreEfD8voi5+miCpjGzp7for2bkWLOdYV++cGN5KhYLeJcNfUrX22ab; ' +
// 				'AWSALBCORS=zdooyvystUqK1pr50QsK3GQuaTvYKu/IYRrJ/5r9mJofFJ2ldKtwobl5Y2Z4q9ZzldLafsreEfD8voi5+miCpjGzp7for2bkWLOdYV++cGN5KhYLeJcNfUrX22ab'
// 		}
// 	};
// 	const result = await requestUrl(options);
// 	console.log(result);
// }
// doTheThing().then(r => {console.log("Done")});
//
// // request(options, function (error, response) {
// // 	if (error) throw new Error(error);
// // 	console.log(JSON.stringify(response.body));
// // });
//
//
// return;
//
// //
// // function findDuplicateTaskIds(fileMetadata) {
// // 	let taskIds = {};
// // 	let duplicates = {};
// //
// // 	for (const file in fileMetadata) {
// // 		fileMetadata[file].TickTickTasks.forEach(task => {
// // 			if (taskIds[task.taskId]) {
// // 				if (!duplicates[task.taskId]) {
// // 					duplicates[task.taskId] = [taskIds[task.taskId]];
// // 				}
// // 				duplicates[task.taskId].push(file);
// // 			} else {
// // 				taskIds[task.taskId] = file;
// // 			}
// // 		});
// // 	}
// // 	console.log(taskIds);
// // 	return duplicates;
// // }
// //
// //
// // const fileMetadata = {
// // 	"Tlist1.md": {
// // 		"TickTickTasks": [
// // 			{
// // 				"taskId": "65e6390d01de1e5bd84c7eff",
// // 				"taskItems": []
// // 			},
// // 			{
// // 				"taskId": "65e6397601de1e5bd84c7f68",
// // 				"taskItems": []
// // 			},
// // 			{
// // 				"taskId": "65e6398101de1e5bd84c7f73",
// // 				"taskItems": []
// // 			},
// // 		],
// // 		"TickTickCount": 7,
// // 		"defaultProjectId": "658dec428f082f0c34c94776"
// // 	},
// // 	"Tlist2 Rename here.md": {
// // 		"TickTickTasks": [
// // 			{
// // 				"taskId": "65e6390d01de1e5bd84c7eff",
// // 				"taskItems": []
// // 			},
// // 			{
// // 				"taskId": "65bbba4e48428279c084fbf8",
// // 				"taskItems": []
// // 			},
// // 			{
// // 				"taskId": "65bd457b77b5217dee21952d",
// // 				"taskItems": []
// // 			},
// // 		],
// // 		"TickTickCount": 4,
// // 		"defaultProjectId": "658dff148f082f0c34cb5c24"
// // 	},
// // 	"💐Bucket.md": {
// // 		"TickTickTasks": [
// // 			{
// // 				"taskId": "65e6390d01de1e5bd84c7eff",
// // 				"taskItems": []
// // 			},
// // 			{
// // 				"taskId": "65bbba4e48428279c084fbf8",
// // 				"taskItems": []
// // 			},
// // 			{
// // 				"taskId": "65bbba1148428279c084fbf2",
// // 				"taskItems": []
// // 			},
// // 		],
// // 		"TickTickCount": 8,
// // 		"defaultProjectId": "65a051e88f08f713340544e7"
// // 	}
// // };
// //
// // const duplicateTaskIds = findDuplicateTaskIds(fileMetadata);
// // console.log(duplicateTaskIds);
// //
// //
// //
// // return;
// //
// //
// //
// //
// //
// // // const operation = "one"
// // // const statusCode = "two"
// // // const errMsg = "three"
// // // let foo = {statusCode, operation , errMsg}
// // // console.log(foo);
// // // console.log(foo.statusCode);
// // // console.log(foo.errMsg);
// // // console.log(operation);
// // // return;
// // const regexString = "^\\s*(-|\\*)\\s+\\[(x| )\\]\\s"
// //
// // const lines = [
// // 	"- [ ] This task added in TT will be in file, but not in Cache This is messed up update from mobile [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65e1e89f49a264082acd1e63) #ticktick %%[ticktick_id:: 65e1e89f49a264082acd1e63]%%",
// // 	"- [x] I'm pretty sure this will mess shit up [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65e21434f8692d195481ca2e) #ticktick %%[ticktick_id:: 65e21434f8692d195481ca2e]%%",
// // 	"- [ ] asdf [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65d624ce3de91c0bcb3585ba) #ticktick %%[ticktick_id:: 65d624ce3de91c0bcb3585ba]%%",
// // 	"- [X] Add Task [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65dcd8a4661f083210f9c418) #ticktick %%[ticktick_id:: 65dcd8a4661f083210f9c418]%%",
// // 	"	- [X] this was nameless [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65dcd9708f080017428d84d3) #ticktick %%[ticktick_id:: 65dcd9708f080017428d84d3]%%",
// // 	"		- [X] so was this [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65dcd9d28f080017428d8d49) #ticktick %%[ticktick_id:: 65dcd9d28f080017428d8d49]%%",
// // 	"- [ ] See this [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65dcf819661f083210f9c4a6) #ticktick %%[ticktick_id:: 65dcf819661f083210f9c4a6]%%",
// // 	"- [X] Add again. Update from TT [link](https://ticktick.com/webapp/#p/65a051e88f08f713340544ea/tasks/65dcfa029f7c7f9940475269) #ticktick %%[ticktick_id:: 65dcfa029f7c7f9940475269]%% 📅 2024-02-26 17:00",
// // 	"- [x] this task  And there was more to do but I didn't do it. ✅ 2024-02-29",
// // 	"- [x] this one"
// // ]
// //
// // lines.forEach((line) =>{
// // 	const arStatus = new RegExp(regexString, 'gmi').exec(line);
// //
// // 	let i= 0;
// // 	if (arStatus) {
// // 		console.log(arStatus[2], arStatus[2].search(/[xX]/))
// // 		console.log("Task is: ", (arStatus[2].search(/[xX]/) < 0)? "open" : "closed")
// // 	} else {
// // 		console.log("not found in: ", line.substring(0,10));
// // 	}
// // })
// // return;
// //
// // function createIreqOptions(method, url, body) {
// // 	const options= {
// // 		method: method,
// // 		url: url,
// // 		headers: {
// // 			'Content-Type': 'application/json',
// // 			Origin : this.originUrl,
// // 			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
// // 			'X-Device': '{"platform":"web","os":"Windows 10","device":"Firefox 121.0","name":"","version":5050,"id":"65957b7390584350542c3c92","channel":"website","campaign":"","websocket":"123"}',
// // 			'X-Requested-With': 'XMLHttpRequest',
// // 			'Cookie': "t=" + this.token
// // 		},
// // 		body: body? JSON.stringify(body): null
// // 	};
// // 	return options;
// // }
// //
// // let options = createIreqOptions("method", "url", {one: "one", two: "two"});
// // console.log("Before: ", options);
// // options.url = "somethign lese"
// // options.method = "als somthien else"
// // options.body = "foo"
// // console.log("After: ", options);
// // options = { method:'POST', url: "//\\"};
// // console.log("And then ", options);
// //
// // // let strings = [
// // // 	"XYZZY mess it up and add [[list 3]] ",
// // // 	"XYZZY mess it up and add [[list 3]] [TasksFolder/Another Test List.md](obsidian://open?vault=testVault&file=TasksFolder/Another%20Test%20List.md)",
// // // 	"Funcking somethign else [[list 3]] [TasksFolder/Another Test List.md](obsidian://open?vault=testVault&file=TasksFolder/Another%20Test%22List.md) [[with more shit here.]]",
// // // 	"XYZZY mess it up and add [[list 2]] [TasksFolder/Another Test List.md](obsidian://open?vault=testVault&file=TasksFolder/Another%20Test%23List.md) and additional foo",
// // // 	"Funcking somethign else [TasksFolder/Another Test List.md](obsidian://open?vault=testVault&file=TasksFolder/Another%20Test%24List.md) and so on",
// // // ]
// // //
// // // strings.forEach(item => {
// // // 	doTheThing(item)
// // // });
// // // function doTheThing(str) {
// // // 	let result = str;
// // // 	let eoURL = str.lastIndexOf(".md)");
// // // 	let boURL = 0
// // // 	if (eoURL > 0) {
// // // 		for (let i = eoURL; i > 0; i--) {
// // // 			if (str[i] === '[') {
// // // 				boURL = i;
// // // 				break;
// // // 			}
// // // 		}
// // // 		if (boURL > 0) {
// // // 			result = str.substring(0, boURL);
// // // 			result = result + str.substring(eoURL + 4);
// // // 		}
// // // 	}
// // // 	console.log(result)
// // //
// // // }
