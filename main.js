const fs = require("fs");
const path = require("path");
const Monitor = require("./assets/classes.js").Monitor;

const { getDateTime } = require("./assets/components.js");

//WIN
const processDirectory = process.cwd();
//MACOS
//const processDirectory = path.dirname(process.execPath);

//WIN
const browserPath = path.join(processDirectory, "chromium", "chrome.exe");
//MAC
//const browserPath = path.join(processDirectory, "chromium", "MacOS", "chromium");

if (!fs.existsSync(path.join(processDirectory, "database.csv"))) {
	fs.writeFileSync(
		path.join(processDirectory, "database.csv"),
		`date;title;url;description\n`
	);
}
if (!fs.existsSync(path.join(processDirectory, "site_database.txt"))) {
	fs.writeFileSync(path.join(processDirectory, "site_database.txt"), "");
}
if (!fs.existsSync(path.join(processDirectory, "config.json"))) {
	fs.writeFileSync(
		path.join(processDirectory, "config.json"),
		`{"slack_webhook_url":"","items":[{"url":"","keywords":"","selector":"","interval":""}]}`
	);
	console.log(
		`[${getDateTime()}][ERROR][NO CONFIGURATION SET][PLEASE CHECK CONFIG.JSON FILE]`
	);
	return setTimeout(() => {}, 30000);
}

const databasePath = path.join(processDirectory, "database.csv");
const siteDatabasePath = path.join(processDirectory, "site_database.txt");
let config = fs
	.readFileSync(path.join(processDirectory, "config.json"), "utf8")
	.trim();

let webHookURL, INTERVAL, keywords, selector;

try {
	config = JSON.parse(config);
	webHookURL = config.slack_webhook_url.replace(/ /g, "");
} catch (e) {
	console.log(
		`[${getDateTime()}][ERROR][WRONG SYNTAX][PLEASE CHECK CONFIG.JSON FILE]`
	);
	return setTimeout(() => {}, 30000);
}

if (webHookURL === "") {
	console.log(
		`[${getDateTime()}][WARNING][NO WEBHOOK URL SPECIFIED IN CONFIG.JSON FILE]`
	);
}

const items = config.items;

if (items.length === 0) {
	return console.log(`[${getDateTime()}][WARNING][NO LINK TO MONITOR]`);
}

for (item of items) {
	if (item.url.replace(/ /g, "") === "") {
		console.log(`[${getDateTime()}][STARTING][NO URL ADRRESS ENTERED]`);
	} else if (isNaN(item.interval)) {
		console.log(`[${getDateTime()}][STARTING][INTERVAL IS NOT A NUMBER]`);
	} else if (item.interval < 0) {
		console.log(
			`[${getDateTime()}][STARTING][ENTERED INTERVAL IS LESS THAN 0]`
		);
	} else {
		if (item.interval.replace(/ /g, "") === "") {
			INTERVAL = 60000;
		} else {
			INTERVAL = item.interval * 1000;
		}

		keywords = item.keywords
			.split(",")
			.map((word) => word.trim().toLowerCase());
		selector = item.selector.trim();

		const instance = new Monitor(
			databasePath,
			browserPath,
			siteDatabasePath,
			webHookURL,
			INTERVAL,
			keywords,
			selector
		);

		const link = item.url.trim();

		if (!link.startsWith("http://") && !link.startsWith("https://")) {
			link = "https://" + link;
		}

		let name;
		try {
			urlObject = new URL(link);
			name = urlObject.hostname;
		} catch (e) {
			console.log(
				`[${getDateTime()}][STARTING][WRONG URL ADRRESS ENTERED] - ${link}`
			);
			return;
		}

		console.log(
			`[${getDateTime()}][${name}][STARTING][INTERVAL: ${
				INTERVAL / 1000
			} seconds][KEYWORDS: ${keywords}]`
		);
		instance.monitor(link);
	}
}
