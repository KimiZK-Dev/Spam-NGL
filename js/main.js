import API from "./api.js";
document.addEventListener("DOMContentLoaded", function () {
	const modal = new bootstrap.Modal(document.getElementById("corsModal"));
	modal.show();

	const checkboxes = document.querySelectorAll(
		'.spam-options input[type="checkbox"]'
	);
	const messageInputContainer = document.getElementById(
		"messageInputContainer"
	);
	const customMessageContainer = document.getElementById(
		"customMessageContainer"
	);
	const singleMessage = document.getElementById("singleMessage");
	const customMessages = document.getElementById("customMessages");

	checkboxes.forEach((checkbox) => {
		checkbox.addEventListener("change", function () {
			if (this.checked) {
				checkboxes.forEach((cb) => {
					if (cb !== this) cb.checked = false;
				});
			}

			if (this.value === "custom" && this.checked) {
				messageInputContainer.style.display = "none";
				customMessageContainer.style.display = "block";
				customMessages.required = true;
				singleMessage.required = false;
			} else {
				if (
					!document.querySelector(
						'.spam-options input[type="checkbox"]:checked'
					)
				) {
					messageInputContainer.style.display = "block";
					singleMessage.required = true;
				} else {
					messageInputContainer.style.display = "none";
					singleMessage.required = false;
				}
				customMessageContainer.style.display = "none";
				customMessages.required = false;
			}
		});
	});

	let currentTry = 0;
	let successCount = 0;
	const resultDiv = document.getElementById("result");
	const sentComplimentsTextarea = document.getElementById(
		"sentComplimentsTextarea"
	);

	document
		.getElementById("complimentForm")
		.addEventListener("submit", async function (event) {
			event.preventDefault();

			const submitButton = document.querySelector(".btn-submit");
			submitButton.disabled = true;

			const username = document.getElementById("username").value;
			const sendCount = parseInt(
				document.getElementById("sendCount").value
			);
			const selectedMode = document.querySelector(
				'.spam-options input[type="checkbox"]:checked'
			);

			if (isNaN(sendCount) || sendCount <= 0) {
				alert("Vui lòng nhập số lượng hợp lệ!");
				submitButton.disabled = false;
				return;
			}

			let message = "";
			let messageList = [];

			if (!selectedMode) {
				message = document.getElementById("singleMessage").value.trim();
				if (!message) {
					alert("Vui lòng nhập nội dung tin nhắn!");
					submitButton.disabled = false;
					return;
				}
				messageList = [message];
			} else if (selectedMode.value === "custom") {
				const customMessages = document
					.getElementById("customMessages")
					.value.trim();
				if (!customMessages) {
					alert("Vui lòng nhập danh sách tin nhắn!");
					submitButton.disabled = false;
					return;
				}
				messageList = customMessages
					.split("\n")
					.filter((msg) => msg.trim());
			} else {
				const mode =
					selectedMode.value === "compliment"
						? "compliment"
						: "insult";
				for (let i = 0; i < sendCount; i++) {
					const randomMessage = await API.getRandomMessage(mode);
					messageList.push(randomMessage);
				}
			}

			resultDiv.innerHTML = `
			<div class="alert alert-info animate__animated animate__fadeIn">
				<div class="spinner-container">
					<div class="spinner-border spinner-border-sm" role="status">
						<span class="visually-hidden">Đang tải...</span>
					</div>
					<span>Đang gửi tin nhắn...</span>
				</div>
			</div>
		`;

			while (currentTry < sendCount) {
				const randomMessage = messageList[currentTry];
				const success = await API.sendMessage(username, randomMessage);

				if (success) {
					successCount++;
					currentTry++;

					const timestamp = new Date().toLocaleTimeString("vi-VN");
					sentComplimentsTextarea.value =
						`[` +
						timestamp +
						`] Tin nhắn #` +
						successCount +
						`: "${randomMessage}" đã gửi thành công!\n` +
						sentComplimentsTextarea.value;

					sentComplimentsTextarea.scrollTop = 0;
				} else {
					await new Promise((resolve) => setTimeout(resolve, 60000));
				}
			}

			resultDiv.innerHTML = `
			<div class="alert alert-success animate__animated animate__fadeIn">
				<div class="d-flex align-items-center">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="success-icon me-2" viewBox="0 0 16 16">
						<path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
					</svg>
					Hoàn thành! Đã gửi ${successCount} tin nhắn thành công.
				</div>
			</div>
		`;

			submitButton.disabled = false;

			document.getElementById("username").value = "";
			document.getElementById("singleMessage").value = "";
			document.getElementById("sendCount").value = "";
			checkboxes.forEach((checkbox) => {
				checkbox.checked = false;
			});

			messageInputContainer.style.display = "block";
			singleMessage.required = true;
			customMessageContainer.style.display = "none";
			customMessages.required = false;

			const separatorLength = 20;
			const separator = "-".repeat(separatorLength);

			sentComplimentsTextarea.value =
				separator + "\n" + sentComplimentsTextarea.value;
		});
});
