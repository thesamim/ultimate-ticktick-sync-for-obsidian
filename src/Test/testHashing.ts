import * as crypto from 'crypto'; // For Node.js, use this line


// Define your object structure
interface MyObject {
	id: string;
	name: string;
	description: string;
	price: number;
}

// Function to generate a hash from an object (stringified)
function generateObjectHash(obj: MyObject): string {
	// Create a simple string from the object (you can use JSON.stringify or custom serialization)
	const serializedObject = `${obj.name}${obj.description}${obj.price}`;
	const hash =  crypto.createHash('sha256').update(serializedObject).digest('hex');
	console.log("obj hash", hash);
	return hash;
}

// Function to generate a hash from the text fields (user-modified text)
function generateTextHash(textFields: { [key in keyof MyObject]: string }): string {
	// Concatenate the text fields (you can customize this based on your needs)
	const serializedText = `${textFields.name}${textFields.description}${textFields.price}`;
	const hash = crypto.createHash('sha256').update(serializedText).digest('hex');
	console.log("text hash", hash);
	return hash
}
function generateTextHashs(inString: string): string {
	// Concatenate the text fields (you can customize this based on your needs)
	const serializedText = inString
	const hash = crypto.createHash('sha256').update(serializedText).digest('hex');
	console.log("text s hash", hash);
	return hash

}

// Function to detect changes by comparing object and text hashes
function detectChangesByHash(object: MyObject, textFields: { [key in keyof MyObject]: string }) {
	const objectHash = generateObjectHash(object);
	const textHash = generateTextHash(textFields);

	if (objectHash !== textHash) {
		console.log('Changes detected!');
		return true; // Indicates a change
	}

	console.log('No changes detected.');
	return false; // No change
}

// Simulate the online object and the local one
let onlineObject: MyObject = {
	"id": "6721216d474fe13216602ed6",
	"projectId": "inbox122979062",
	"sortOrder": -1099511627780,
	"title": "Account thesamim.foo",
	"content": "",
	"timeZone": "America/Chicago",
	"isFloating": false,
	"isAllDay": true,
	"reminder": "",
	"reminders": [],
	"exDate": [],
	"priority": 0,
	"status": 0,
	"items": [],
	"progress": 0,
	"modifiedTime": "2024-11-21T17:20:08.673+0000",
	"etag": "1qx4pede",
	"deleted": 0,
	"createdTime": "2024-10-29T17:54:54.778+0000",
	"creator": 122979062,
	"tags": [
	"ticktick"
],
	"columnId": "67127652916d3f587597651d",
	"childIds": [],
	"kind": "TEXT",
	"dateHolder": {}

};

let localObject: MyObject = { ...onlineObject };

// Text fields as they appear in the UI (modified by the user)
let textFields: { [key in keyof MyObject]: string } = {
	name: "Sample Product", // unchanged
	description: "A fantastic product!", // modified
	price: "19.99", // unchanged
};

// Check for changes
const changesDetected = detectChangesByHash(localObject, textFields);
console.log("test String hash", generateTextHashs("- [ ] test This  [link](https://ticktick.com/webapp/#p/65aed0248f086bf8fe18c2de/tasks/6740a5aeb1a1f75030e9958f) #ticktick  %%[ticktick_id:: 6740a5aeb1a1f75030e9958f]%% 📅 2024-11-29\n"));
console.log("test String hash", generateTextHashs("- [ ] test s This  [link](https://ticktick.com/webapp/#p/65aed0248f086bf8fe18c2de/tasks/6740a5aeb1a1f75030e9958f) #ticktick  %%[ticktick_id:: 6740a5aeb1a1f75030e9958f]%% 📅 2024-11-29\n"));

console.log(changesDetected);
