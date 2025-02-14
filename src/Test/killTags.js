const tags= [
	{"name": "something-somethingelse-somethingother"},
	{"name": "#somethingelse"},
	{"name": "463587677"},
	{"name": "52537962"},
	{"name": "church"},
	{"name": "find"},
	{"name": "firstlevel-secondlevel-thirdlevel"},
	{"name": "foo-bar-baz"},
	{"name": "foxtrot1"},
	{"name": "house"},
	{"name": "inköp"},
	{"name": "inköp,"},
	{"name": "insurance"},
	{"name": "mixedcase"},
	{"name": "movie"},
	{"name": "nolatrip"},
	{"name": "other"},
	{"name": "other-second-third"},
	{"name": "othermixedcase"},
	{"name": "photo"},
	{"name": "restaurant"},
	{"name": "second"},
	{"name": "secondlevel"},
	{"name": "something-somethingelse-somethingother"},
	{"name": "somethingelse"},
	{"name": "subaru"},
	{"name": "sync"},
	{"name": "third"},
	{"name": "thirdlevel"},
	{"name": "thismixedcasetag"},
	{"name": "ticktick"},
	{"name": "toplevel"},
	{"name": "uppercase"},
	{"name": "vällingby"},
	{"name": "vällingby."},
	{"name": "ärenden"},
	{"name": "ärenden-inköp"},
]

function doTheThing(tag) {
	const myHeaders = new Headers();
	myHeaders.append("t", "154BB8FE91446783A20CF4C71864072919379231F1B0AB3D96D8E5D0D6B38B448337E08EF90D49B143884352A481B52D8AF50C0EC428BDFCC4DF513F39334C5216D0A39676247F5E4A1B5F5DA273AD2D4414EB8B83F18F111EF5F1D93E6E17B282BEE463B1431075BC4DD36207DCA5A84414EB8B83F18F11E1300650F1192461D5CEB4026B93FA00034645F5A647A51D69F79B085F322C972E41D3F5B95B28DE7353686E6CEE8A83");
	myHeaders.append("Content-Type", "application/json");
	myHeaders.append("Authorization", "Bearer d368d188-d203-49b8-9550-0b17bde25a36");
	myHeaders.append("Cookie", "_csrf_token=SwrXc4cjERL9LwqxOe1U3O52319EhBHsjy_zV15iCtM-1710619558; t=154BB8FE9144678372E5451FDB4BD909CA7BAD1C66BDA5251B393AD2F4CF03A6A099ECAF125ACACF58FDF77D649EE24B91AF328B753235AE08F2C8F3D4B29722CB39D2DA703BFC90D4A721B29989A984D354806D06193B6758CC04AE69E6968482BEE463B1431075BC4DD36207DCA5A8D354806D06193B67FB0F4CC3CBF7C730DD7AA2F0D7907F391537B521884EF06E42C696B9F7F2F8F1710BADDD6AC6A9E9441259BAE0414AF2; AWSALB=/PNzwosnwDXUF6w+lqde1B58YlIVt+MNAe4IKyPtpGFYp6IHbT1Ot0GvIdZJuFkocJLsK9Q4DsX3l2YdjJdsWWZL7f67IOLMTeTURlJwC4FD6iwVp5yuIoLIjtNM; AWSALBCORS=/PNzwosnwDXUF6w+lqde1B58YlIVt+MNAe4IKyPtpGFYp6IHbT1Ot0GvIdZJuFkocJLsK9Q4DsX3l2YdjJdsWWZL7f67IOLMTeTURlJwC4FD6iwVp5yuIoLIjtNM");

	const raw = JSON.stringify(tag);
	const requestOptions = {
		method: "DELETE",
		headers: myHeaders,
		body: raw,
		redirect: "follow"
	};
	console.log("---");
	fetch("https://api.ticktick.com/api/v2/tag/delete", requestOptions)
		.then((response) => console.log("response", response.status))
		.then((result) => console.log("result", result))
		.catch((error) => console.error("error", error));

	console.log("---");
}
function doTheOtherThing(tag) {
	const myHeaders = new Headers();
	myHeaders.append("t", "154BB8FE91446783C736C5DD8D2ECD7B209F61AC65D1FA167D4F994AFC5CC82BA484CBF50C7C8FCB249935528599536591AF328B753235AE08F2C8F3D4B29722CB39D2DA703BFC90D4A721B29989A984B2AA1C6BB7A5012710ED8EEFCEA86F2782BEE463B1431075BC4DD36207DCA5A8B2AA1C6BB7A501274CCE46E1C3BF4066DD7AA2F0D7907F391537B521884EF06E42C696B9F7F2F8F1710BADDD6AC6A9E9441259BAE0414AF2");
	myHeaders.append("Content-Type", "application/json");
	myHeaders.append("Authorization", "Bearer d368d188-d203-49b8-9550-0b17bde25a36");
	myHeaders.append("Cookie", "_csrf_token=FN9je4rnfvtIH0dJE9n0QnPwvzMs1QZ3T0G0pfmPdCw-1726608046; t=154BB8FE914467838F42A831BEFB02571B676C434A3102DA2E77C6475F02FA2F7716828A1CE02550181A467451DA26FB8AF50C0EC428BDFCC4DF513F39334C5216D0A39676247F5E4A1B5F5DA273AD2D5C069EEA9F4712AF41379D37233E87E182BEE463B1431075BC4DD36207DCA5A85C069EEA9F4712AFC7B72F664B674302D5CEB4026B93FA00034645F5A647A51D69F79B085F322C972E41D3F5B95B28DE7353686E6CEE8A83; AWSALB=P/eG1xfxfgGE3KA+HRIbUe3XOu4fKDbyIFKF7gedeElUhmEPnf4MOk6wj1/zxT3VKMqHHDcSRXSnz5vdEg3CFHeQFRk0EGdVCPeb1KbswzGCy+73Rn0X8FTWT/Yw; AWSALBCORS=P/eG1xfxfgGE3KA+HRIbUe3XOu4fKDbyIFKF7gedeElUhmEPnf4MOk6wj1/zxT3VKMqHHDcSRXSnz5vdEg3CFHeQFRk0EGdVCPeb1KbswzGCy+73Rn0X8FTWT/Yw");

	const raw = JSON.stringify(tag);

	const requestOptions = {
		method: "DELETE",
		headers: myHeaders,
		body: raw,
		redirect: "follow"
	};

	fetch("https://api.ticktick.com/api/v2/tag/delete", requestOptions)
		.then((response) => response.text())
		.then((result) => console.log(result))
		.catch((error) => console.error(error));
}
tags.forEach(tag => doTheOtherThing(tag))
