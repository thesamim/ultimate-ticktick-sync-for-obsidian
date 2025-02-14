const myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");
myHeaders.append("User-Agent", "Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.6.7 Chrome/124.0.6367.243 Electron/30.1.2 Safari/537.36");
myHeaders.append("x-device", "{\"platform\":\"web\",\"os\":\"Windows 10\",\"device\":\"Firefox 117.0\",\"name\":\"\",\"version\":124.0.6367.243,\"id\":\"124.0.6367.243\",\"channel\":\"website\",\"campaign\":\"\",\"websocket\":\"\"}");
myHeaders.append("Cookie", "AWSALB=ohsg7Bjlm7/DJ5z74tSlJP/f5cOlemRQ/nGqQpkcVN1Z0JocS8YhO0pSoGNqvdOS8eGeE1jeIDy7G0S5x2qvoFSibNcWjEDplpN2ouaXKny36Px88Yn2JYfTZ2q0; AWSALBCORS=ohsg7Bjlm7/DJ5z74tSlJP/f5cOlemRQ/nGqQpkcVN1Z0JocS8YhO0pSoGNqvdOS8eGeE1jeIDy7G0S5x2qvoFSibNcWjEDplpN2ouaXKny36Px88Yn2JYfTZ2q0; _csrf_token=DkuFzNQrPRT03WCC8Pcu1KPqvtLx8VdRTSJqnOBKMQ-1729173777; t=154BB8FE914467832ACD5A4585D1B76BE3E3E42DFC39537ED11B15F72A6845279761658019BF6D0B1E3B17A604171AEB8AF50C0EC428BDFCC4DF513F39334C5216D0A39676247F5E4A1B5F5DA273AD2D6D8D38505EC75728D3569D87A966F11A82BEE463B1431075BC4DD36207DCA5A86D8D38505EC75728DB7698C358A235B1D5CEB4026B93FA00034645F5A647A51D69F79B085F322C972E41D3F5B95B28DE7353686E6CEE8A83");

const raw = JSON.stringify({
	"password": "howdyhowdy",
	"username": "thesamim.foo@gmail.com"
});
console.log("Headers: ", myHeaders)
const requestOptions = {
	method: "POST",
	headers: myHeaders,
	body: raw,
	redirect: "follow"
};

fetch("https://ticktick.com/api/v2/user/signon?wc=true&remember=true", requestOptions)
	.then((response) => response.text())
	.then((result) => console.log(result))
	.catch((error) => console.error(error));
