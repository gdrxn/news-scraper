const fs = require("fs");
const csv = require("fast-csv");

const { getDateTime, sendWebHook } = require("./components");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");

class Monitor {
	constructor(
		databasePath,
		browserPath,
		siteDatabasePath,
		webHookURL,
		INTERVAL,
		keywords,
		selector
	) {
		this.databasePath = databasePath;
		this.browserPath = browserPath;
		this.siteDatabasePath = siteDatabasePath;
		this.webHookURL = webHookURL;
		this.INTERVAL = INTERVAL;
		this.keywords = keywords;
		this.selector = selector;
	}

	async monitor(url) {
		let oldLinkList = [],
			urlObject = new URL(url),
			name = urlObject.hostname;

		const browser = await puppeteer.launch({
			//executablePath: this.browserPath,
			headless: true,
			args: [
				"--window-size=1920,1080",
				'--user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36"',
			],
		});

		const page = await browser.newPage();
		await page.setCacheEnabled(false);
		await page._client.send("Network.clearBrowserCookies");

		await page.setRequestInterception(true);
		page.on("request", (request) => {
			if (["image", "font"].includes(request.resourceType())) {
				request.abort();
			} else {
				request.continue();
			}
		});

		while (true) {
			try {
				const response = await page.goto(url, {
					waitUntil: "networkidle2",
				});

				if (response._status === 200) {
					const source = await page.content();

					const $ = cheerio.load(source);
					let newLinkList = [];

					const redirectUrlObject = new URL(response._url);

					$(this.selector + " a").each(function () {
						let link;

						try {
							link = $(this).attr("href").replace(/ /g, "").split(/[&#]/)[0];
						} catch (e) {
							return;
						}

						if (
							link.match("(//www.|//)" + urlObject.hostname) ||
							link.match("(//www.|//)" + redirectUrlObject.hostname) ||
							link.match(/^\/\w.*/)
						) {
							if (link.match(/^\/\/\w.*/)) {
								link = "https:" + link;
							} else if (link.match(/^\/\w.*/)) {
								link = redirectUrlObject.origin + link.match(/^\/\w.*/);
							}

							newLinkList.push(link);
						}
					});

					newLinkList = [...new Set(newLinkList)];

					/* FOR TESTING PURPOSES
                    return console.dir(newLinkList, {
                        maxArrayLength: null
                    });
                    */

					let newAddedLinks = newLinkList.filter(
						(link) => !oldLinkList.includes(link)
					);

					if (oldLinkList.length === 0) {
						oldLinkList = newLinkList;

						fs.readFile(this.siteDatabasePath, "utf8", (err, data) => {
							if (err) {
								return console.log(
									`[${getDateTime()}][${name}][MONITOR][READ FILE FAILED] - ${url}:\n`,
									err
								);
							}

							const siteDatabse = data.toString().split(/\r?\n/).filter(String);

							const linksToCheck = newLinkList.filter(
								(link) => !siteDatabse.includes(link)
							);

							for (let linkToCheck of linksToCheck) {
								fs.appendFile(
									this.siteDatabasePath,
									`${linkToCheck}\n`,
									function (err) {
										if (err) {
											return console.log(
												`[${getDateTime()}][${name}][MONITOR][WRITE FILE FAILED] - ${linkToCheck}:\n`,
												err
											);
										}
									}
								);
							}

							this.checkPage(name, linksToCheck);
						});

						console.log(
							`[${getDateTime()}][${name}][MONITOR][INITIALIZING LINK LIST][${
								newLinkList.length
							}]`
						);
						await page.waitForTimeout(this.INTERVAL);
					} else if (newAddedLinks.length === 0) {
						oldLinkList = newLinkList;

						console.log(
							`[${getDateTime()}][${name}][MONITOR][NO CHANGE][${
								newLinkList.length
							}]`
						);

						await page.waitForTimeout(this.INTERVAL);
					} else {
						oldLinkList = newLinkList;

						fs.readFile(this.siteDatabasePath, "utf8", (err, data) => {
							if (err) {
								return console.log(
									`[${getDateTime()}][${name}][MONITOR][READ FILE FAILED] - ${url}:\n`,
									err
								);
							}

							const siteDatabse = data.toString().split(/\r?\n/).filter(String);

							const linksToCheck = newLinkList.filter(
								(link) => !siteDatabse.includes(link)
							);

							if (linksToCheck.length === 0) {
								console.log(
									`[${getDateTime()}][${name}][MONITOR][NO CHANGE 2][${
										newLinkList.length
									}]`
								);
							} else {
								console.log(
									`[${getDateTime()}][${name}][MONITOR][NEW LINKS HAS BEEN FOUND][${
										newLinkList.length
									}]`
								);

								for (let linkToCheck of linksToCheck) {
									fs.appendFile(
										this.siteDatabasePath,
										`${linkToCheck}\n`,
										function (err) {
											if (err) {
												return console.log(
													`[${getDateTime()}][${name}][MONITOR][WRITE FILE FAILED] - ${linkToCheck}:\n`,
													err
												);
											}
										}
									);
								}

								this.checkPage(name, linksToCheck);
							}
						});

						await page.waitForTimeout(this.INTERVAL);
					}
				} else if (response._status === 403 || response._status === 429) {
					console.log(
						`[${getDateTime()}][${name}][MONITOR][ACCESS IS BLOCKED] - ${url}`
					);
					break;
				} else {
					console.log(
						`[${getDateTime()}][${name}][MONITOR][UNKNOWN RESPONSE][${
							response._status
						} - ${response._statusText}] - ${url}`
					);
				}
			} catch (error) {
				if (
					error.name.includes("TimeoutError") ||
					error.name.includes("ERR_CONNECTION_RESET") ||
					error.name.includes("ERR_CONNECTION_CLOSED")
				) {
					console.log(
						`[${getDateTime()}][${name}][MONITOR][CONNECTION ERROR] - ${url}`
					);
				} else if (error.name.includes("ERR_INTERNET_DISCONNECTED")) {
					console.log(
						`[${getDateTime()}][${name}][MONITOR][NO CONNECTION] - ${url}`
					);
				} else if (error.message.includes("ERR_NAME_NOT_RESOLVED")) {
					console.log(
						`[${getDateTime()}][${name}][MONITOR][ERROR][WRONG URL ADRRESS] - ${url}`
					);
					break;
				} else if (
					error.message.includes(
						"Session closed. Most likely the page has been closed"
					) ||
					error.message.includes(
						"Navigation failed because browser has disconmected!"
					)
				) {
					console.log(`[${getDateTime()}][${name}][BROWSER HAS BEEN CLOSED]`);
					break;
				} else {
					console.log(`[${getDateTime()}][${name}][MONITOR][ERROR]- ${url}`);
					console.log(error);
				}
			}
		}

		browser.close();
	}

	async checkPage(name, urls) {
		const browser = await puppeteer.launch({
			//executablePath: this.browserPath,
			headless: true,
		});

		const page = await browser.newPage();
		await page.setCacheEnabled(false);
		await page._client.send("Network.clearBrowserCookies");

		await page.setRequestInterception(true);
		page.on("request", (request) => {
			if (["image", "font"].includes(request.resourceType())) {
				request.abort();
			} else {
				request.continue();
			}
		});

		for (let url of urls) {
			try {
				const response = await page.goto(url, {
					waitUntil: "networkidle2",
				});

				if (response._status === 200) {
					const source = await page.content();
					const $ = cheerio.load(source);

					let title = "";
					let description = "";
					let image = "";

					if (
						$("meta[property*='title']").attr("content") ||
						$("meta[name*='title']").attr("content")
					) {
						if ($("meta[property*='title']").attr("content")) {
							title += $("meta[property*='title']").attr("content") + "\n";
						} else if ($("meta[name*='title']").attr("content")) {
							title += $("meta[name*='title']").attr("content") + "\n";
						}
					}

					if (
						$("meta[name*='description']").attr("content") ||
						$("meta[property*='description']").attr("content")
					) {
						if ($("meta[name*='description']").attr("content")) {
							description +=
								$("meta[name*='description']").attr("content") + "\n";
						} else if ($("meta[property*='description']").attr("content")) {
							description +=
								$("meta[property*='description']").attr("content") + "\n";
						}
					}

					if (
						$("meta[property*='image']").attr("content") ||
						$("meta[name*='image']").attr("content")
					) {
						if ($("meta[property*='image']").attr("content")) {
							image = $("meta[property*='image']").attr("content");
						} else if ($("meta[name*='image']").attr("content")) {
							image = $("meta[name*='image']").attr("content");
						}

						const redirectUrlObject = new URL(response._url);

						if (image.match(/^\/\/\w.*/)) {
							image = "https:" + image;
						} else if (image.match(/^\/\w.*/)) {
							image = redirectUrlObject.origin + image.match(/^\/\w.*/);
						}
					}

					if (
						this.keywords.some((keyword) =>
							title.toLowerCase().includes(keyword.toLowerCase())
						) ||
						this.keywords.some((keyword) =>
							description.toLowerCase().includes(keyword.toLowerCase())
						)
					) {
						const append = (file, rows = []) => {
							let csvFile = fs.createWriteStream(file, {
								flags: "a",
							});
							csv.writeToStream(csvFile, rows, {
								includeEndRowDelimiter: true,
								delimiter: ";",
							});
						};

						let urls = [];
						csv
							.parseFile(this.databasePath, {
								delimiter: ";",
								headers: true,
							})
							.on("error", (error) => console.error(error))
							.on("data", (row) => urls.push(row.url))
							.on("end", (rowCount) => {
								if (urls.includes(url)) {
									console.log(
										`[${getDateTime()}][${name}][CHECK PAGE][KEYWORDS FOUND][THE FOUND URL IS ALREADY IN DATABASE] - ${url}`
									);
								} else {
									console.log(
										`[${getDateTime()}][${name}][CHECK PAGE][KEYWORDS FOUND][THE FOUND URL IS NEW] - ${url}`
									);
									append(this.databasePath, [
										[getDateTime(), title, url, description],
									]);

									if (this.webHookURL !== "") {
										sendWebHook(
											this.webHookURL,
											name,
											url,
											title,
											description,
											image
										);
									}
								}
							});
					} else {
						console.log(
							`[${getDateTime()}][${name}][CHECK PAGE][NO KEYWORDS MATCHED] - ${url}`
						);
					}
				} else if (response._status === 403 || response._status === 429) {
					console.log(
						`[${getDateTime()}][${name}][CHECK PAGE][ACCESS IS BLOCKED] - ${url}`
					);
				} else if (response._status === 404) {
					console.log(
						`[${getDateTime()}][${name}][CHECK PAGE][PAGE IS NOT FOUND] - ${url}`
					);
				} else {
					console.log(
						`[${getDateTime()}][${name}][CHECK PAGE][UNKNOWN RESPONSE][${
							response._status
						} - ${response._statusText}] - ${url}`
					);
					this.checkPage(name, [url]);
				}
			} catch (error) {
				if (
					error.name.includes("TimeoutError") ||
					error.name.includes("ERR_CONNECTION_RESET") ||
					error.name.includes("ERR_CONNECTION_CLOSED")
				) {
					console.log(
						`[${getDateTime()}][${name}][CHECK PAGE][CONNECTION ERROR] - ${url}`
					);
				} else if (error.name.includes("ERR_INTERNET_DISCONNECTED")) {
					console.log(
						`[${getDateTime()}][${name}][CHECK PAGE][NO CONNECTION] - ${url}`
					);
				} else if (error.message.includes("ERR_NAME_NOT_RESOLVED")) {
					return console.log(
						`[${getDateTime()}][${name}][CHECK PAGE][ERROR][WRONG URL ADRRESS] - ${url}`
					);
				} else if (
					error.message.includes(
						"Session closed. Most likely the page has been closed"
					) ||
					error.message.includes(
						"Navigation failed because browser has disconnected!"
					)
				) {
					return console.log(
						`[${getDateTime()}][${name}][BROWSER HAS BEEN CLOSED]`
					);
				} else {
					console.log(
						`[${getDateTime()}][${name}][CHECK PAGE][ERROR] - ${url}`
					);
					console.log(error);
				}

				this.checkPage(name, [url]);
			}
		}

		await browser.close();
	}
}

module.exports = {
	Monitor,
};
