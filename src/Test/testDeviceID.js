
function generateUniqueId(force = false) {
	// const screenHeight = screen.height;
	// const userAgent = navigator.userAgent;
	// const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	// const uniqueId = userAgent + screenWidth + screenHeight + timeZone;
	//
	// return btoa(uniqueId); // Encode to make it more manageable
	// const screenWidth = screen.width;

	return force;
}

// const uniqueDeviceId = generateUniqueId();
// console.log(uniqueDeviceId);
console.log(generateUniqueId());
console.log(generateUniqueId(true));

