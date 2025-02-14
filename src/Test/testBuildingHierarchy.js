function buildTaskData(data) {
	const taskData = [];

	// Map headings by their start and end line ranges
	const headings = data.headings.map(heading => ({
		heading: heading.heading,
		startLine: heading.position.start.line,
		endLine: heading.position.end.line,
	}));

	// Helper function to find the heading for a given line
	function findHeadingForLine(line) {
		for (let i = headings.length - 1; i >= 0; i--) {
			const heading = headings[i];
			if (line >= heading.startLine) {
				return heading.heading;
			}
		}
		return null;
	}

	// Helper function to resolve parents
	function resolveParent(task, tasks) {
		if (task.parent >= 0 && task.parent < tasks.length) {
			return task.parent;
		}
		return null;
	}

	// Process listItems
	data.listItems.forEach((item, index) => {
		if (item.task !== undefined) {
			const heading = findHeadingForLine(item.position.start.line);
			const parentIndex = resolveParent(item, data.listItems);

			taskData.push({
				startLine: item.position.start.line,
				endLine: item.position.end.line,
				parent: parentIndex,
				heading: heading,
			});
		}
	});

	return taskData;
}

// // Example Usage
// const data = {
// 	/* Your JSON object here */
// };
// Example Usage
/* Your JSON object here */
const data = {
	"headings": [
		{
			"position": {
				"start": {
					"line": 3,
					"col": 0,
					"offset": 51
				},
				"end": {
					"line": 3,
					"col": 11,
					"offset": 62
				}
			},
			"heading": "heading 1",
			"level": 1
		}
	],
	"sections": [
		{
			"type": "list",
			"position": {
				"start": {
					"line": 0,
					"col": 0,
					"offset": 0
				},
				"end": {
					"line": 2,
					"col": 20,
					"offset": 50
				}
			}
		},
		{
			"type": "heading",
			"position": {
				"start": {
					"line": 3,
					"col": 0,
					"offset": 51
				},
				"end": {
					"line": 3,
					"col": 11,
					"offset": 62
				}
			}
		},
		{
			"type": "list",
			"position": {
				"start": {
					"line": 4,
					"col": 0,
					"offset": 63
				},
				"end": {
					"line": 6,
					"col": 17,
					"offset": 110
				}
			}
		},
		{
			"type": "paragraph",
			"position": {
				"start": {
					"line": 8,
					"col": 0,
					"offset": 112
				},
				"end": {
					"line": 8,
					"col": 8,
					"offset": 120
				}
			}
		},
		{
			"type": "code",
			"position": {
				"start": {
					"line": 10,
					"col": 0,
					"offset": 122
				},
				"end": {
					"line": 12,
					"col": 3,
					"offset": 168
				}
			}
		}
	],
	"listItems": [
		{
			"position": {
				"start": {
					"line": 0,
					"col": 0,
					"offset": 0
				},
				"end": {
					"line": 0,
					"col": 12,
					"offset": 12
				}
			},
			"parent": -1,
			"task": " "
		},
		{
			"position": {
				"start": {
					"line": 1,
					"col": 2,
					"offset": 15
				},
				"end": {
					"line": 1,
					"col": 16,
					"offset": 29
				}
			},
			"parent": 0,
			"task": " "
		},
		{
			"position": {
				"start": {
					"line": 2,
					"col": 6,
					"offset": 36
				},
				"end": {
					"line": 2,
					"col": 20,
					"offset": 50
				}
			},
			"parent": 1,
			"task": " "
		},
		{
			"position": {
				"start": {
					"line": 4,
					"col": 0,
					"offset": 63
				},
				"end": {
					"line": 4,
					"col": 12,
					"offset": 75
				}
			},
			"parent": -4,
			"task": " "
		},
		{
			"position": {
				"start": {
					"line": 5,
					"col": 2,
					"offset": 78
				},
				"end": {
					"line": 5,
					"col": 16,
					"offset": 92
				}
			},
			"parent": 4,
			"task": " "
		},
		{
			"position": {
				"start": {
					"line": 6,
					"col": 5,
					"offset": 98
				},
				"end": {
					"line": 6,
					"col": 17,
					"offset": 110
				}
			},
			"parent": 5,
			"task": " "
		}
	]
}


const taskData = buildTaskData(data);
console.log(JSON.stringify(taskData, null, 2));
