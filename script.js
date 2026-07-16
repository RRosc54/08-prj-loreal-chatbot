"use strict";

/* ========================================
   Configuration
   ======================================== */

/*
  Replace this URL after deploying your
  Cloudflare Worker.
*/
const WORKER_URL =
  "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev";

const STORAGE_KEY = "loreal-chat-history";
const MAX_HISTORY_MESSAGES = 12;

/* ========================================
   DOM Elements
   ======================================== */

const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendBtn = document.getElementById("sendBtn");
const clearChatBtn = document.getElementById(
  "clearChatBtn"
);

const latestQuestionBox = document.getElementById(
  "latestQuestionBox"
);

const latestQuestionText = document.getElementById(
  "latestQuestionText"
);

/* ========================================
   Conversation State
   ======================================== */

let conversationHistory = loadConversationHistory();

/* ========================================
   Initial Setup
   ======================================== */

initializeChat();

chatForm.addEventListener(
  "submit",
  handleFormSubmit
);

clearChatBtn.addEventListener(
  "click",
  clearConversation
);

/* ========================================
   Form Submission
   ======================================== */

async function handleFormSubmit(event) {
  event.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    return;
  }

  displayLatestQuestion(question);
  appendMessage(question, "user");

  addMessageToHistory({
    role: "user",
    content: question
  });

  userInput.value = "";
  setLoadingState(true);

  const typingMessage = appendTypingIndicator();

  try {
    validateWorkerURL();

    const response = await fetch(WORKER_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages: conversationHistory
      })
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The server returned a response that could not be read."
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
          "The beauty advisor could not complete the request."
      );
    }

    const assistantReply = data.reply?.trim();

    if (!assistantReply) {
      throw new Error(
        "The beauty advisor returned an empty response."
      );
    }

    typingMessage.remove();

    appendMessage(
      assistantReply,
      "assistant"
    );

    addMessageToHistory({
      role: "assistant",
      content: assistantReply
    });
  } catch (error) {
    console.error(
      "Chatbot error:",
      error
    );

    typingMessage.remove();

    appendMessage(
      createFriendlyErrorMessage(error),
      "assistant",
      true
    );
  } finally {
    setLoadingState(false);
    userInput.focus();
  }
}

/* ========================================
   Initialize Chat
   ======================================== */

function initializeChat() {
  chatWindow.innerHTML = "";

  if (conversationHistory.length === 0) {
    appendMessage(
      "👋 Welcome to the L'Oréal Smart Routine & Product Advisor! Tell me about your skin, hair, makeup, or fragrance goals, and I'll help you build a personalized routine.",
      "assistant"
    );

    latestQuestionBox.hidden = true;
    userInput.focus();

    return;
  }

  conversationHistory.forEach((message) => {
    appendMessage(
      message.content,
      message.role
    );
  });

  const mostRecentUserMessage =
    [...conversationHistory]
      .reverse()
      .find(
        (message) =>
          message.role === "user"
      );

  if (mostRecentUserMessage) {
    displayLatestQuestion(
      mostRecentUserMessage.content
    );
  }

  scrollChatToBottom();
}

/* ========================================
   Conversation History
   ======================================== */

function loadConversationHistory() {
  try {
    const savedHistory =
      sessionStorage.getItem(STORAGE_KEY);

    if (!savedHistory) {
      return [];
    }

    const parsedHistory =
      JSON.parse(savedHistory);

    if (!Array.isArray(parsedHistory)) {
      return [];
    }

    return parsedHistory
      .filter(isValidHistoryMessage)
      .slice(-MAX_HISTORY_MESSAGES);
  } catch (error) {
    console.warn(
      "Could not load chat history:",
      error
    );

    return [];
  }
}

function saveConversationHistory() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversationHistory)
    );
  } catch (error) {
    console.warn(
      "Could not save chat history:",
      error
    );
  }
}

function addMessageToHistory(message) {
  conversationHistory.push(message);

  if (
    conversationHistory.length >
    MAX_HISTORY_MESSAGES
  ) {
    conversationHistory =
      conversationHistory.slice(
        -MAX_HISTORY_MESSAGES
      );

    /*
      Avoid beginning the shortened history
      with an assistant response.
    */
    if (
      conversationHistory[0]?.role ===
      "assistant"
    ) {
      conversationHistory.shift();
    }
  }

  saveConversationHistory();
}

function isValidHistoryMessage(message) {
  return (
    message &&
    (
      message.role === "user" ||
      message.role === "assistant"
    ) &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function clearConversation() {
  conversationHistory = [];

  try {
    sessionStorage.removeItem(
      STORAGE_KEY
    );
  } catch (error) {
    console.warn(
      "Could not clear saved chat:",
      error
    );
  }

  latestQuestionText.textContent = "";
  latestQuestionBox.hidden = true;

  initializeChat();
}

/* ========================================
   Message Display
   ======================================== */

function appendMessage(
  text,
  role,
  isError = false
) {
  const messageRow =
    document.createElement("div");

  messageRow.className =
    `message-row ${role}`;

  if (role === "assistant") {
    const avatar =
      document.createElement("div");

    avatar.className =
      "advisor-avatar";

    avatar.setAttribute(
      "aria-hidden",
      "true"
    );

    avatar.textContent = "L";

    messageRow.appendChild(avatar);
  }

  const messageBubble =
    document.createElement("article");

  messageBubble.className =
    `msg ${role}`;

  if (isError) {
    messageBubble.classList.add(
      "error-message"
    );
  }

  const speakerLabel =
    document.createElement("strong");

  speakerLabel.textContent =
    role === "user"
      ? "YOU"
      : "L'ORÉAL BEAUTY ADVISOR";

  const messageText =
    document.createElement("p");

  /*
    textContent prevents the user's input or
    AI response from being treated as HTML.
  */
  messageText.textContent = text;

  messageBubble.append(
    speakerLabel,
    messageText
  );

  messageRow.appendChild(
    messageBubble
  );

  chatWindow.appendChild(
    messageRow
  );

  scrollChatToBottom();

  return messageRow;
}

function appendTypingIndicator() {
  const messageRow =
    document.createElement("div");

  messageRow.className =
    "message-row assistant typing-message-row";

  const avatar =
    document.createElement("div");

  avatar.className =
    "advisor-avatar";

  avatar.setAttribute(
    "aria-hidden",
    "true"
  );

  avatar.textContent = "L";

  const messageBubble =
    document.createElement("article");

  messageBubble.className =
    "msg assistant";

  const speakerLabel =
    document.createElement("strong");

  speakerLabel.textContent =
    "L'ORÉAL BEAUTY ADVISOR";

  const typingIndicator =
    document.createElement("div");

  typingIndicator.className =
    "typing-indicator";

  typingIndicator.setAttribute(
    "aria-label",
    "Advisor is typing"
  );

  for (let i = 0; i < 3; i += 1) {
    const dot =
      document.createElement("span");

    typingIndicator.appendChild(dot);
  }

  messageBubble.append(
    speakerLabel,
    typingIndicator
  );

  messageRow.append(
    avatar,
    messageBubble
  );

  chatWindow.appendChild(
    messageRow
  );

  scrollChatToBottom();

  return messageRow;
}

function displayLatestQuestion(question) {
  latestQuestionText.textContent =
    question;

  latestQuestionBox.hidden = false;
}

function scrollChatToBottom() {
  chatWindow.scrollTo({
    top: chatWindow.scrollHeight,
    behavior: "smooth"
  });
}

/* ========================================
   Loading State
   ======================================== */

function setLoadingState(isLoading) {
  userInput.disabled = isLoading;
  sendBtn.disabled = isLoading;

  sendBtn.setAttribute(
    "aria-label",
    isLoading
      ? "Waiting for response"
      : "Send message"
  );

  const sendIcon =
    sendBtn.querySelector(
      ".material-icons"
    );

  if (sendIcon) {
    sendIcon.textContent =
      isLoading
        ? "hourglass_top"
        : "send";
  }
}

/* ========================================
   Error Handling
   ======================================== */

function validateWorkerURL() {
  const hasPlaceholder =
    WORKER_URL.includes(
      "YOUR-WORKER-NAME"
    ) ||
    WORKER_URL.includes(
      "YOUR-SUBDOMAIN"
    );

  if (!WORKER_URL || hasPlaceholder) {
    throw new Error(
      "Add your deployed Cloudflare Worker URL near the top of script.js."
    );
  }
}

function createFriendlyErrorMessage(error) {
  const message =
    error?.message || "";

  const lowercaseMessage =
    message.toLowerCase();

  if (
    message.includes(
      "Cloudflare Worker URL"
    )
  ) {
    return `Setup needed: ${message}`;
  }

  if (
    lowercaseMessage.includes(
      "api key"
    ) ||
    lowercaseMessage.includes(
      "unauthorized"
    )
  ) {
    return "The API key is missing or invalid. Check the OPENAI_API_KEY secret in your Cloudflare Worker settings.";
  }

  if (
    lowercaseMessage.includes(
      "quota"
    ) ||
    lowercaseMessage.includes(
      "billing"
    )
  ) {
    return "The OpenAI account may not have available API credits. Check the account's billing and usage settings.";
  }

  if (
    lowercaseMessage.includes(
      "failed to fetch"
    )
  ) {
    return "I couldn't reach the Cloudflare Worker. Check the Worker URL, deployment status, and CORS settings.";
  }

  return (
    message ||
    "I'm having trouble connecting right now. Please try again."
  );
}