const myHeaders = new Headers();
myHeaders.append('Cookie',
	't=154BB8FE91446783FF397A17DCFFF3BBCA143713B453A0B20A7AE5F80D0F197D01C2F0146E652E79C124CF3234A5F54D8AF50C0EC428BDFCC4DF513F39334C5216D0A39676247F5E4A1B5F5DA273AD2D1C92447F37C66D78AE98A00302D0B05282BEE463B1431075BC4DD36207DCA5A81C92447F37C66D78F7710D37AADA4EA8D5CEB4026B93FA00034645F5A647A51D69F79B085F322C972E41D3F5B95B28DE7353686E6CEE8A83; ' );

const requestOptions = {
	method: 'GET',
	headers: myHeaders,
	redirect: 'follow'
};

fetch('https://api.ticktick.com/api/v2/batch/check/1356998400000', requestOptions)
	.then((response) => console.log('Got A Response: ', response.status))
	.then((result) => console.log('Got a result'))
	.catch((error) => console.error(error));
