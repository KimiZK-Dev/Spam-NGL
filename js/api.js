const API = {
	proxyList: [],
	currentProxyIndex: -1,
	failedProxies: new Set(),
	retryDelay: 1000,
	maxRetries: 3,
	queue: [],
	isProcessing: false,
	concurrentRequests: 5,
	stats: {
		total: 0,
		success: 0,
		failed: 0,
		rateLimited: 0,
		startTime: null,
		endTime: null,
	},

	userAgents: [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0",
	],

	deviceId: null,

	generateDeviceId() {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
			/[xy]/g,
			function (c) {
				const r = (Math.random() * 16) | 0;
				const v = c === "x" ? r : (r & 0x3) | 0x8;
				return v.toString(16);
			}
		);
	},

	async loadProxies(proxyList) {
		if (!Array.isArray(proxyList) || proxyList.length === 0) {
			throw new Error("Invalid proxy list");
		}
		this.proxyList = proxyList;
		this.currentProxyIndex = 0;
		this.failedProxies.clear();
		this.deviceId = this.generateDeviceId();
		this.resetStats();
		console.log(`Loaded ${this.proxyList.length} proxies`);
		return true;
	},

	resetStats() {
		this.stats = {
			total: 0,
			success: 0,
			failed: 0,
			rateLimited: 0,
			startTime: null,
			endTime: null,
		};
	},

	updateStats(status) {
		if (!this.stats.startTime) {
			this.stats.startTime = new Date();
		}

		switch (status) {
			case "success":
				this.stats.success++;
				break;
			case "failed":
				this.stats.failed++;
				break;
			case "rateLimit":
				this.stats.rateLimited++;
				break;
		}
		this.stats.total = this.stats.success + this.stats.failed;
	},

	getNextProxy() {
		if (this.proxyList.length === 0) return null;

		const initialIndex = this.currentProxyIndex;
		do {
			this.currentProxyIndex =
				(this.currentProxyIndex + 1) % this.proxyList.length;
			const proxy = this.proxyList[this.currentProxyIndex];

			if (!this.failedProxies.has(proxy)) {
				console.log(`Using proxy: ${proxy}`);
				return proxy;
			}
		} while (this.currentProxyIndex !== initialIndex);

		console.log("All proxies failed, resetting failed list");
		this.failedProxies.clear();
		return this.proxyList[0];
	},

	async sendRequest(username, message, gameSlug = "", proxy) {
		const data = new URLSearchParams({
			username,
			question: message,
			deviceId: this.deviceId,
			gameSlug: gameSlug || "",
			referrer: `https://ngl.link/${username}`,
		});

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000);

		try {
			const response = await fetch("https://ngl.link/api/submit", {
				method: "POST",
				headers: {
					"Content-Type":
						"application/x-www-form-urlencoded; charset=UTF-8",
					Accept: "*/*",
					"User-Agent":
						this.userAgents[
							Math.floor(Math.random() * this.userAgents.length)
						],
					"X-Requested-With": "XMLHttpRequest",
					Origin: "https://ngl.link",
					Referer: `https://ngl.link/${username}`,
				},
				body: data,
				signal: controller.signal,
				proxy: `http://${proxy}`,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				if (response.status === 429) {
					this.failedProxies.add(proxy);
					throw { status: 429, message: "Rate limited", proxy };
				}
				throw { status: response.status, message: "Request failed" };
			}

			const result = await response.json();
			return { success: true, data: result };
		} catch (error) {
			if (error.name === "AbortError") {
				this.failedProxies.add(proxy);
				throw { status: 408, message: "Request timeout", proxy };
			}
			throw {
				status: error.status || 500,
				message: error.message || "Unknown error",
				proxy,
			};
		} finally {
			clearTimeout(timeoutId);
		}
	},

	async processBatch(items) {
		const batchPromises = items.map(async (item) => {
			let currentProxy = this.getNextProxy();
			let attempts = 0;

			while (attempts < this.maxRetries) {
				try {
					const result = await this.sendRequest(
						item.username,
						item.message,
						item.gameSlug,
						currentProxy
					);

					if (result.success) {
						this.updateStats("success");
						item.onSuccess?.(item.message);
						return true;
					}
				} catch (error) {
					attempts++;

					if (error.status === 429) {
						this.updateStats("rateLimit");
						currentProxy = this.getNextProxy();

						if (attempts < this.maxRetries) {
							item.onRateLimit?.();
							await new Promise((resolve) =>
								setTimeout(resolve, this.retryDelay * attempts)
							);
							continue;
						}
					}

					if (attempts >= this.maxRetries) {
						this.updateStats("failed");
						item.onError?.(item.message, error);
						return false;
					}

					currentProxy = this.getNextProxy();
					await new Promise((resolve) =>
						setTimeout(resolve, this.retryDelay)
					);
				}
			}
			return false;
		});

		return Promise.allSettled(batchPromises);
	},

	async processQueue() {
		if (this.queue.length === 0) {
			this.isProcessing = false;
			return;
		}

		this.isProcessing = true;

		try {
			while (this.queue.length > 0) {
				const batch = this.queue.splice(0, this.concurrentRequests);
				const results = await this.processBatch(batch);

				const failedItems = batch.filter((_, index) => {
					const result = results[index];
					return (
						result.status === "rejected" ||
						(result.status === "fulfilled" && !result.value)
					);
				});

				failedItems.forEach((item) => {
					if (!item.retries || item.retries < this.maxRetries) {
						this.queue.push({
							...item,
							retries: (item.retries || 0) + 1,
						});
					}
				});

				if (this.queue.length > 0) {
					await new Promise((resolve) =>
						setTimeout(resolve, this.retryDelay)
					);
				}
			}
		} catch (error) {
			console.error("Queue processing error:", error);
		} finally {
			if (this.queue.length === 0) {
				this.stats.endTime = new Date();
				this.isProcessing = false;
			}
		}
	},

	addToQueue(username, message, gameSlug, onSuccess, onError, onRateLimit) {
		const queueItem = {
			username,
			message,
			gameSlug,
			retries: 0,
			onSuccess: (msg) => {
				console.log(`Success: "${msg}"`);
				onSuccess?.(msg);
			},
			onError: (msg, error) => {
				console.error(`Failed to send "${msg}":`, error);
				onError?.(msg, error);
			},
			onRateLimit: () => {
				console.warn("Rate limited, switching proxy...");
				onRateLimit?.();
			},
		};

		this.queue.push(queueItem);

		if (!this.isProcessing) {
			this.processQueue();
		}
	},

	getStats() {
		const now = new Date();
		const duration = this.stats.startTime
			? ((this.stats.endTime || now) - this.stats.startTime) / 1000
			: 0;

		return {
			...this.stats,
			duration: duration.toFixed(2),
			successRate: this.stats.total
				? ((this.stats.success / this.stats.total) * 100).toFixed(2)
				: 0,
			remaining: this.queue.length,
			speed: duration ? (this.stats.success / duration).toFixed(2) : 0,
		};
	},

	clearQueue() {
		this.queue = [];
		this.isProcessing = false;
		this.resetStats();
	},
};

export default API;
