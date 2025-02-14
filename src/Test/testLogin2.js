const myHeaders = new Headers();

const randomNumber = generateRandomNumber();
const deviceString = {
	platform: "web",
	os: "Windows 10",
	device: "Electron 30.1.2",
	name: "",
	version: "124.0.6367.243",
	id: randomNumber,

	channel: "website",
	campaign: "",
	websocket: ""
}
myHeaders.append("Content-Type", "application/json");
myHeaders.append("x-device", `${JSON.stringify(deviceString)}`);
myHeaders.append("Cookie", "AWSALB=3Wmz3bqL3cS4RRJzzW42u73pI4HOFoco3lfjZwfYW5xdQZWp41X51OvXWb+oH8HVEw3MgomxX1BiLVFrluiufPecgt6B+tWfK0kQXJWU/8twY6tcvkFvocrTBaip; AWSALBCORS=3Wmz3bqL3cS4RRJzzW42u73pI4HOFoco3lfjZwfYW5xdQZWp41X51OvXWb+oH8HVEw3MgomxX1BiLVFrluiufPecgt6B+tWfK0kQXJWU/8twY6tcvkFvocrTBaip; _csrf_token=FN9je4rnfvtIH0dJE9n0QnPwvzMs1QZ3T0G0pfmPdCw-1726608046; t=154BB8FE914467839B0F7FD080997B1C954BEF1213D038B6C460A7873E18CF0B9C5D1EB5089E462533F4F499F2CA4FCD91AF328B753235AE08F2C8F3D4B29722CB39D2DA703BFC90D4A721B29989A984C960A19A815EA024EB744DBEECBC617482BEE463B1431075BC4DD36207DCA5A8C960A19A815EA024523160FD9443B858DD7AA2F0D7907F391537B521884EF06E42C696B9F7F2F8F1710BADDD6AC6A9E9441259BAE0414AF2");

const raw = JSON.stringify({
	"password": "ANewPassPhrase123",
	"username": "thesamim@yahoo.com"
});

const requestOptions = {
	method: "POST",
	headers: myHeaders,
	body: raw,
	redirect: "follow"
};
console.log("Headers: ", myHeaders)
fetch("https://ticktick.com/api/v2/user/signon?wc=true&remember=true", requestOptions)
	.then((response) => {
		console.log("Response: ", response.status);
		response.text();
	})
	.then((result) => console.log(result))
	.catch((error) => console.error(error));

function generateRandomNumber() {
	const prefix = '66';
	const length = 24; // Total length of the string
	const characters = '0123456789abcdef'; // Allowed characters (hexadecimal)

	let result = prefix; // Start with '66'

	// Calculate the number of characters needed after the prefix
	const remainingLength = length - prefix.length;

	for (let i = 0; i < remainingLength; i++) {
		const randomIndex = Math.floor(Math.random() * characters.length);
		result += characters[randomIndex]; // Append a random character
	}

	return result;
}



