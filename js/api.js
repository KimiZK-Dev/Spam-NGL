const API = {
	userAgents: [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
	],

	async loadMessagesFromFile(filePath) {
		try {
			const response = await fetch(filePath);
			if (!response.ok) {
				throw new Error(`Failed to load file: ${filePath}`);
			}
			const text = await response.text();

			return text
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
		} catch (error) {
			console.error("Error loading messages:", error);
			return [];
		}
	},

	async getRandomMessage(mode, customMessages = "") {
		if (mode === "custom" && customMessages.trim()) {
			const messages = customMessages
				.split("\n")
				.filter((msg) => msg.trim());
			return messages[Math.floor(Math.random() * messages.length)];
		}

		const filePath =
			mode === "compliment"
				? "./messages/compliments.txt"
				: "./messages/insults.txt";
		const templates = await this.loadMessagesFromFile(filePath);

		if (templates.length === 0) {
			throw new Error("Message list is empty. Check file content!");
		}

		return templates[Math.floor(Math.random() * templates.length)];
	},

	generateDeviceId() {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) =>
			((Math.random() * 16) | 0).toString(16)
		);
	},

	async sendMessage(username, message) {
		const data = new URLSearchParams({
			username: username,
			question: message,
			deviceId: this.generateDeviceId(),
			gameSlug: "",
			referrer: `https://ngl.link/${username}`,
		});

		const randomUserAgent =
			this.userAgents[Math.floor(Math.random() * this.userAgents.length)];

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000);

			const response = await fetch("https://ngl.link/api/submit", {
				method: "POST",
				headers: {
					"Content-Type":
						"application/x-www-form-urlencoded; charset=UTF-8",
					Accept: "*/*",
					"User-Agent": randomUserAgent,
					"X-Requested-With": "XMLHttpRequest",
					Origin: "https://ngl.link",
					Referer: `https://ngl.link/${username}`,
				},
				body: data,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(
					`Request failed with status ${response.status}`
				);
			}

			await response.json();

			const randomDelay = Math.floor(
				Math.random() * (2000 - 1000 + 1) + 1000
			);
			await new Promise((resolve) => setTimeout(resolve, randomDelay));

			return true;
		} catch (error) {
			console.error("Error sending request:", error);
			return false;
		}
	},
};

export default API;
