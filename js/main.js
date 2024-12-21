import API from "./api.js";

document.addEventListener("DOMContentLoaded", async function () {
	const elements = {
		form: document.getElementById("complimentForm"),
		username: document.getElementById("username"),
		sendCount: document.getElementById("sendCount"),
		gameSlug: document.getElementById("gameSlug"),
		singleMessage: document.getElementById("singleMessage"),
		customMessages: document.getElementById("customMessages"),
		messageInputContainer: document.getElementById("messageInputContainer"),
		customMessageContainer: document.getElementById(
			"customMessageContainer"
		),
		resultDiv: document.getElementById("result"),
		sentComplimentsTextarea: document.getElementById(
			"sentComplimentsTextarea"
		),
		submitButton: document.querySelector(".btn-submit"),
		checkboxes: document.querySelectorAll(
			'.spam-options input[type="checkbox"]'
		),
	};

	let successCount = 0;
	let totalToSend = 0;
	let isRateLimited = false;
	let complimentsList = [];
	let insultsList = [];
	let currentDeviceId = generateDeviceId();

	function generateDeviceId() {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
			/[xy]/g,
			function (c) {
				const r = (Math.random() * 16) | 0;
				const v = c === "x" ? r : (r & 0x3) | 0x8;
				return v.toString(16);
			}
		);
	}

	async function loadMessageLists() {
		try {
			const complimentsResponse = await fetch(
				"./messages/compliments.txt"
			);
			if (!complimentsResponse.ok)
				throw new Error("Failed to load compliments");
			const complimentsText = await complimentsResponse.text();
			complimentsList = complimentsText
				.split("\n")
				.filter((msg) => msg.trim());

			const insultsResponse = await fetch("./messages/insults.txt");
			if (!insultsResponse.ok) throw new Error("Failed to load insults");
			const insultsText = await insultsResponse.text();
			insultsList = insultsText.split("\n").filter((msg) => msg.trim());
		} catch (error) {
			console.error("Error loading message lists:", error);
			updateStatus(
				"error",
				"Không thể tải danh sách tin nhắn: " + error.message
			);
			throw error;
		}
	}

	async function loadProxiesFromFile() {
		try {
			const response = await fetch("./js/proxy.txt");
			if (!response.ok) throw new Error("Failed to load proxies");
			const text = await response.text();
			const proxyList = text
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && line.includes(":"));
			if (proxyList.length === 0)
				throw new Error("No valid proxies found");
			return proxyList;
		} catch (error) {
			console.error("Error loading proxies:", error);
			updateStatus(
				"error",
				"Không thể tải danh sách proxy: " + error.message
			);
			throw error;
		}
	}

	async function initialize() {
		try {
			const modal = new bootstrap.Modal(
				document.getElementById("corsModal")
			);
			modal.show();
			await Promise.all([
				loadMessageLists(),
				API.loadProxies(await loadProxiesFromFile()),
			]);
			setupEventListeners();
			updateMessageInputVisibility();
		} catch (error) {
			console.error("Initialization error:", error);
			updateStatus("error", "Lỗi khởi tạo: " + error.message);
		}
	}

	function setupEventListeners() {
		elements.checkboxes.forEach((checkbox) => {
			checkbox.addEventListener("change", handleCheckboxChange);
		});
		elements.form.addEventListener("submit", handleFormSubmit);
	}

	function handleCheckboxChange(event) {
		if (event.target.checked) {
			elements.checkboxes.forEach((cb) => {
				if (cb !== event.target) cb.checked = false;
			});
		}
		updateMessageInputVisibility();
	}

	function updateMessageInputVisibility() {
		const selectedMode = document.querySelector(
			'.spam-options input[type="checkbox"]:checked'
		);
		elements.messageInputContainer.style.display = "none";
		elements.customMessageContainer.style.display = "none";
		elements.singleMessage.required = false;
		elements.customMessages.required = false;
		if (!selectedMode) {
			elements.messageInputContainer.style.display = "block";
			elements.singleMessage.required = true;
		} else if (selectedMode.value === "custom") {
			elements.customMessageContainer.style.display = "block";
			elements.customMessages.required = true;
		}
	}

	function updateStatus(type, message) {
		const alertClass = {
			sending: "alert-info",
			rateLimit: "alert-warning",
			success: "alert-success",
			error: "alert-danger",
		}[type];
		elements.resultDiv.innerHTML = `
            <div class="alert ${alertClass} animate__animated animate__fadeIn">
                <div class="d-flex align-items-center">
                    ${
						type === "sending" || type === "rateLimit"
							? `<div class="spinner-border spinner-border-sm me-2" role="status">
                            <span class="visually-hidden">Đang tải...</span>
                           </div>`
							: type === "success"
							? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="success-icon me-2" viewBox="0 0 16 16">
                            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                           </svg>`
							: ""
					}
                    ${message}
                </div>
            </div>
        `;
	}

	function getRandomMessages(list, count) {
		const messages = [];
		for (let i = 0; i < count; i++) {
			messages.push(list[Math.floor(Math.random() * list.length)]);
		}
		return messages;
	}

	async function prepareMessages(formData) {
		const selectedMode = document.querySelector(
			'.spam-options input[type="checkbox"]:checked'
		);
		if (!selectedMode) {
			const message = elements.singleMessage.value.trim();
			return Array(formData.sendCount).fill(message);
		}
		switch (selectedMode.value) {
			case "compliment":
				return getRandomMessages(complimentsList, formData.sendCount);
			case "insult":
				return getRandomMessages(insultsList, formData.sendCount);
			case "custom":
				const customMsgs = elements.customMessages.value
					.trim()
					.split("\n")
					.filter((msg) => msg.trim());
				return Array.from(
					{ length: formData.sendCount },
					(_, i) => customMsgs[i % customMsgs.length]
				);
			default:
				throw new Error("Invalid message mode selected");
		}
	}

	async function handleFormSubmit(event) {
		event.preventDefault();
		const formData = {
			username: elements.username.value.trim(),
			sendCount: parseInt(elements.sendCount.value),
			gameSlug: elements.gameSlug.value,
		};
		if (!validateForm(formData)) return;
		elements.submitButton.disabled = true;
		successCount = 0;
		isRateLimited = false;
		totalToSend = formData.sendCount;
		try {
			const messages = await prepareMessages(formData);
			sendMessages(formData.username, messages, formData.gameSlug);
		} catch (error) {
			console.error("Error preparing messages:", error);
			updateStatus("error", "Lỗi chuẩn bị tin nhắn: " + error.message);
			elements.submitButton.disabled = false;
		}
	}

	function validateForm(formData) {
		if (!formData.username) {
			alert("Vui lòng nhập tên người dùng!");
			elements.submitButton.disabled = false;
			return false;
		}
		if (isNaN(formData.sendCount) || formData.sendCount <= 0) {
			alert("Vui lòng nhập số lượng tin nhắn hợp lệ!");
			elements.submitButton.disabled = false;
			return false;
		}
		const selectedMode = document.querySelector(
			'.spam-options input[type="checkbox"]:checked'
		);
		if (!selectedMode && !elements.singleMessage.value.trim()) {
			alert("Vui lòng nhập nội dung tin nhắn!");
			elements.submitButton.disabled = false;
			return false;
		}
		if (
			selectedMode?.value === "custom" &&
			!elements.customMessages.value.trim()
		) {
			alert("Vui lòng nhập danh sách tin nhắn!");
			elements.submitButton.disabled = false;
			return false;
		}
		return true;
	}

	function sendMessages(username, messages, gameSlug) {
		updateStatus("sending", `Đang gửi ${messages.length} tin nhắn...`);
		messages.forEach((message) => {
			API.addToQueue(
				username,
				message,
				gameSlug,
				handleSuccess,
				handleError,
				handleRateLimit
			);
		});
	}

	function handleSuccess(message) {
		successCount++;
		const timestamp = new Date().toLocaleTimeString("vi-VN");
		updateSentMessages(timestamp, message);
		if (successCount === totalToSend) {
			handleCompletion();
		}
	}

	function handleError(message, error) {
		console.error(`Lỗi gửi tin nhắn: "${message}"`, error);
		updateStatus(
			"error",
			`Lỗi khi gửi tin nhắn: ${error.message || "Lỗi không xác định"}`
		);
	}

	function handleRateLimit() {
		if (!isRateLimited) {
			isRateLimited = true;
			updateStatus(
				"rateLimit",
				"Đã gặp giới hạn gửi tin, đang thử lại với proxy khác..."
			);
		}
	}

	function handleCompletion() {
		updateStatus(
			"success",
			`Hoàn thành! Đã gửi ${successCount} tin nhắn thành công.`
		);
		elements.submitButton.disabled = false;
		elements.sentComplimentsTextarea.value =
			"-".repeat(50) + "\n" + elements.sentComplimentsTextarea.value;
		resetForm();
	}

	function updateSentMessages(timestamp, message) {
		elements.sentComplimentsTextarea.value =
			`[${timestamp}] Tin nhắn #${successCount}: "${message}" đã gửi thành công!\n` +
			elements.sentComplimentsTextarea.value;
		elements.sentComplimentsTextarea.scrollTop = 0;
	}

	function resetForm() {
		elements.form.reset();
		updateMessageInputVisibility();
		API.clearQueue();
		successCount = 0;
		totalToSend = 0;
		isRateLimited = false;
	}

	await initialize();
});
