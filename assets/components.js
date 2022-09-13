const rp = require("request-promise-native").defaults({
	simple: false,
	resolveWithFullResponse: true,
	followAllRedirects: true,
	timeout: 5000,
	gzip: true,
});

const getDateTime = () => {
	let date = new Date();

	let day = date.toLocaleDateString();

	let hour = date.getHours();
	hour = (hour < 10 ? "0" : "") + hour;

	let min = date.getMinutes();
	min = (min < 10 ? "0" : "") + min;

	let sec = date.getSeconds();
	sec = (sec < 10 ? "0" : "") + sec;

	let milli = date.getMilliseconds();
	if (milli < 10) {
		milli = "00" + milli;
	} else if (milli < 100) {
		milli = "0" + milli;
	}

	return day + " " + hour + ":" + min + ":" + sec + ":" + milli;
};

const sendWebHook = (webHookURL, name, url, title, description, image) => {
	rp({
		uri: webHookURL,
		method: "POST",
		json: true,
		body: {
			attachments: [
				{
					fallback: `${name}: ${title}`,
					pretext: `*NEW ITEM*`,
					title: title,
					title_link: url,
					fields: [
						{
							title: "Description",
							value: `${description}`,
							short: true,
						},
						{
							title: "Site",
							value: `${name}`,
							short: true,
						},
					],
					thumb_url: image,
					color: "",
					mrkdwn_in: ["pretext", "text", "fields"],
				},
			],
		},
	})
		.then((res) => {
			if (res.body === "ok") {
				console.log(`[${getDateTime()}][${name}][WEBHOOK][SUCCESS] - ${url}`);
			} else {
				console.log(`[${getDateTime()}][${name}][WEBHOOK][FAILED] - ${url}`);
				console.log(res.body);

				setTimeout(function () {
					sendWebHook(name, url);
				}, 500);
			}
		})
		.catch((error) => {
			if (
				error.message.includes("TIMEDOUT") ||
				error.message.includes("ECONNRESET") ||
				error.message.includes("tunneling socket could not be established")
			) {
				console.log(
					`[${getDateTime()}][${name}][WEBHOOK][CONNECTION ERROR] - ${url}`
				);
			} else if (error.message.includes("ENOTFOUND")) {
				console.log(
					`[${getDateTime()}][${name}][WEBHOOK][CANNOT REACH THE SITE] - ${url}`
				);
			} else {
				console.log(`[${getDateTime()}][${name}][WEBHOOK][ERROR] - ${url}`);
				console.log(error);
			}

			setTimeout(function () {
				sendWebHook(webHookURL, name, url, title, description, image);
			}, 500);
		});
};

module.exports = {
	getDateTime,
	sendWebHook,
};
