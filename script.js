"use strict";

// 1. SUPABASE CONNECTION
// Publishable keys are intended for frontend use.
// Never put a service_role or secret key here.

const SUPABASE_URL =
  "https://tnfgrldttypqwtslzskw.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_fOnWhL_BYnwou5YZb9vudA_-ManBVPQ";

const sb = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// 2. HTML ELEMENTS

const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const authForm = document.getElementById("auth-form");
const authMessage = document.getElementById("auth-message");

const displayName = document.getElementById("display-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const signupBtn = document.getElementById("signup-btn");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");

const who = document.getElementById("who");
const messageList = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

// 3. APP STATE

let currentUser = null;
let channel = null;
let chatVersion = 0;

const names = Object.create(null);

// 4. AUTHENTICATION

function setAuthBusy(busy) {
  signupBtn.disabled = busy;
  loginBtn.disabled = busy;
}

async function signUp() {
  const name = displayName.value.trim();

  if (name.length < 2 || name.length > 24) {
    authMessage.textContent =
      "Display name must be 2 to 24 characters.";
    return;
  }

  setAuthBusy(true);
  authMessage.textContent = "Creating your account...";

  try {
    const { data, error } = await sb.auth.signUp({
      email: emailInput.value.trim(),
      password: passwordInput.value,
      options: {
        data: {
          display_name: name
        }
      }
    });

    if (error) throw error;

    if (!data.session) {
      authMessage.textContent =
        "Check your email to confirm your account.";
    } else {
      authMessage.textContent =
        "Account created successfully!";
    }
  } catch (error) {
    console.error("Signup error:", error);
    authMessage.textContent = error.message;
  } finally {
    setAuthBusy(false);
  }
}

async function logIn() {
  setAuthBusy(true);
  authMessage.textContent = "Logging in...";

  try {
    const { error } = await sb.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });

    if (error) throw error;

    authMessage.textContent = "";
  } catch (error) {
    console.error("Login error:", error);
    authMessage.textContent = error.message;
  } finally {
    setAuthBusy(false);
  }
}

authForm.addEventListener("submit", event => {
  event.preventDefault();

  if (authForm.reportValidity()) {
    logIn();
  }
});

signupBtn.addEventListener("click", () => {
  if (authForm.reportValidity()) {
    signUp();
  }
});

logoutBtn.addEventListener("click", async () => {
  const { error } = await sb.auth.signOut();

  if (error) {
    alert("Logout failed: " + error.message);
  }
});

// 5. PROFILE NAMES

async function loadNames() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name");

  if (error) {
    console.error("Profile loading error:", error);
    return;
  }

  for (const profile of data || []) {
    names[profile.id] = profile.display_name;
  }

  console.log("Profiles received:", data);
  console.log("Names loaded:", names);
}

async function nameFor(userId) {
  if (names[userId]) {
    return names[userId];
  }

  const { data, error } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Profile lookup error:", error);
  }

  if (data && data.display_name) {
    names[userId] = data.display_name;
    return names[userId];
  }

  return "Unknown";
}

// 6. AUTH STATE

sb.auth.onAuthStateChange((event, session) => {
  const user = session?.user || null;

  setTimeout(() => {
    if (user) {
      if (!currentUser || currentUser.id !== user.id) {
        startChat(user);
      }
    } else if (currentUser) {
      stopChat();
    }
  }, 0);
});

// 7. START AND STOP CHAT

async function startChat(user) {
  const version = ++chatVersion;

  currentUser = user;

  authScreen.hidden = true;
  chatScreen.hidden = false;

  who.textContent = "Loading...";

  try {
    await loadNames();

    if (version !== chatVersion) return;

    const actualName = await nameFor(user.id);

    if (version !== chatVersion) return;

    who.textContent =
      actualName !== "Unknown"
        ? actualName
        : user.user_metadata?.display_name || "Signed in";

    await loadMessages();

    if (version !== chatVersion) return;

    listenForNewMessages();
    messageInput.focus();
  } catch (error) {
    console.error("Chat startup error:", error);
    who.textContent = "Signed in";
  }
}

function stopChat() {
  ++chatVersion;

  currentUser = null;

  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }

  messageList.innerHTML = "";
  passwordInput.value = "";

  chatScreen.hidden = true;
  authScreen.hidden = false;
}

// 8. DISPLAY MESSAGES

function showMessage(msg) {
  if (!currentUser) return;

  if (messageList.querySelector(
    '[data-id="' + msg.id + '"]'
  )) {
    return;
  }

  const isMine = msg.user_id === currentUser.id;

  const item = document.createElement("li");
  item.className = isMine
    ? "message mine"
    : "message";

  item.dataset.id = msg.id;

  const author = document.createElement("span");
  author.className = "author";

  author.textContent =
    names[msg.user_id] ||
    (isMine
      ? who.textContent
      : "Unknown");

  const body = document.createElement("p");
  body.textContent = msg.content;

  const time = document.createElement("time");

  time.textContent = new Date(
    msg.created_at
  ).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });

  item.append(author, body, time);
  messageList.appendChild(item);

  messageList.scrollTop = messageList.scrollHeight;
}

// 9. LOAD MESSAGES

async function loadMessages() {
  const { data, error } = await sb
    .from("messages")
    .select("id, user_id, content, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Message loading error:", error);
    return;
  }

  messageList.innerHTML = "";

  for (const msg of (data || []).reverse()) {
    await nameFor(msg.user_id);
    showMessage(msg);
  }
}

// 10. SEND MESSAGES

messageForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const content = messageInput.value.trim();

  if (!content) return;

  messageInput.value = "";

  if (content.startsWith("/")) {
    await handleCommand(content);
    return;
  }

  const { data, error } = await sb
    .from("messages")
    .insert({ content })
    .select()
    .single();

  if (error) {
    console.error("Send error:", error);
    alert("Could not send: " + error.message);
    messageInput.value = content;
    return;
  }

  await nameFor(data.user_id);
  showMessage(data);
});

// 11. REALTIME MESSAGES

function listenForNewMessages() {
  if (channel) {
    sb.removeChannel(channel);
  }

  channel = sb
    .channel("class-chat")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      async payload => {
        if (!currentUser) return;

        const userId = currentUser.id;

        await nameFor(payload.new.user_id);

        if (currentUser?.id !== userId) return;

        showMessage(payload.new);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "messages"
      },
      payload => {
        if (payload.old?.id != null) {
          removeMessage(payload.old.id);
        }
      }
    )
    .subscribe(status => {
      console.log("Realtime status:", status);
    });
}

function removeMessage(id) {
  const item = messageList.querySelector(
    '[data-id="' + id + '"]'
  );

  if (item) item.remove();
}

// 12. WEATHER BOT

const GEO_URL =
  "https://geocoding-api.open-meteo.com/v1/search";

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast";

function describeWeather(code) {
  if (code === 0) return "clear sky";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "foggy";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";

  return "thunderstorm";
}

async function getWeather(city) {
  const geoUrl =
    GEO_URL +
    "?name=" +
    encodeURIComponent(city) +
    "&count=1";

  const geoResponse = await fetch(geoUrl);

  if (!geoResponse.ok) {
    throw new Error("Geocoding failed");
  }

  const geoData = await geoResponse.json();

  if (!geoData.results?.length) {
    return "City not found: " + city;
  }

  const place = geoData.results[0];

  const weatherUrl =
    WEATHER_URL +
    "?latitude=" + place.latitude +
    "&longitude=" + place.longitude +
    "&current=temperature_2m,weather_code,wind_speed_10m";

  const weatherResponse = await fetch(weatherUrl);

  if (!weatherResponse.ok) {
    throw new Error("Weather request failed");
  }

  const weatherData = await weatherResponse.json();
  const now = weatherData.current;

  return (
    place.name + ", " + place.country + ": " +
    now.temperature_2m + "°C, " +
    describeWeather(now.weather_code) +
    ", wind " +
    now.wind_speed_10m + " km/h"
  );
}

async function handleCommand(text) {
  const words = text.trim().split(/\s+/);

  if (words[0].toLowerCase() !== "/weather") {
    showBotMessage(
      "Unknown command. Try: /weather Manila"
    );
    return;
  }

  const city = words.slice(1).join(" ").trim();

  if (!city) {
    showBotMessage("Try: /weather Manila");
    return;
  }

  showBotMessage("Checking weather...");

  try {
    const result = await getWeather(city);
    showBotMessage(result);
  } catch (error) {
    console.error("Weather error:", error);
    showBotMessage(
      "Weather service is unavailable right now."
    );
  }
}

function showBotMessage(text) {
  const item = document.createElement("li");
  item.className = "message bot";

  const author = document.createElement("span");
  author.className = "author";
  author.textContent = "WeatherBot (private)";

  const body = document.createElement("p");
  body.textContent = text;

  item.append(author, body);
  messageList.appendChild(item);

  messageList.scrollTop = messageList.scrollHeight;
}
