const BACKEND_URL = 'https://zen-desk-pro-xp6v.vercel.app';
const GOOGLE_CLIENT_ID = '947597922943-icg9cju1p1ns1gpt7254s8arkhubdjcu.apps.googleusercontent.com';

/**
 * ZenDesk Pro - Aurora Interface Script
 * Author: Gemini
 *
 * This script manages the functionality of the ZenDesk Pro dashboard, including
 * multi-user authentication, user-specific data for tasks and notes, a timer, 
 * and dynamic widgets for weather and quotes.
 */

// A proxy object on the window to safely expose app methods to inline HTML event handlers.
window.appProxy = {};

document.addEventListener('DOMContentLoaded', () => {

    // --- Aurora Background Effect ---
    const canvas = document.getElementById('aurora-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let particles = [];
    const colors = ["#00f6ff", "#ff00c1", "#4f46e5"];

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.radius = Math.random() * 50 + 50;
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
        draw() {
            ctx.beginPath();
            const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
            g.addColorStop(0, this.color + "33");
            g.addColorStop(1, this.color + "00");
            ctx.fillStyle = g;
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        for (let i = 0; i < 15; i++) {
            particles.push(new Particle());
        }
    }

    function animateAurora() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        requestAnimationFrame(animateAurora);
    }

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initParticles();
    });

    initParticles();
    animateAurora();

    // --- Main Application Logic ---
    const App = {
        state: {
            users: [],
            activeUserEmail: null,
            timerInterval: null,
            dateTimeInterval: null,
            timerSeconds: 1500,
            isTimerRunning: false,
            chatHistory: [],
            isListening: false,
            isSpeaking: false,
            googleClientId: null,
        },

        elements: {
            loginForm: document.getElementById('loginForm'),
            signupForm: document.getElementById('signupForm'),
            dashboard: document.getElementById('dashboard'),
            loginFormElement: document.getElementById('loginFormElement'),
            signupFormElement: document.getElementById('signupFormElement'),
            showSignup: document.getElementById('showSignup'),
            showLogin: document.getElementById('showLogin'),
            logoutBtn: document.getElementById('logoutBtn'),
            userName: document.getElementById('userName'),
            userAvatar: document.getElementById('userAvatar'),
            dateTime: document.getElementById('date-time'),
            greeting: document.getElementById('greeting'),
            taskList: document.getElementById('taskList'),
            taskInput: document.getElementById('taskInput'),
            taskPriority: document.getElementById('taskPriority'),
            addTaskBtn: document.getElementById('addTaskBtn'),
            notesList: document.getElementById('notesList'),
            noteInput: document.getElementById('noteInput'),
            addNoteBtn: document.getElementById('addNoteBtn'),
            timerDisplay: document.getElementById('timerDisplay'),
            startTimer: document.getElementById('startTimer'),
            pauseTimer: document.getElementById('pauseTimer'),
            resetTimer: document.getElementById('resetTimer'),
            quoteText: document.getElementById('quoteText'),
            quoteAuthor: document.getElementById('quoteAuthor'),
            weatherTemp: document.getElementById('weatherTemp'),
            weatherLocation: document.getElementById('weatherLocation'),
            weatherIcon: document.getElementById('weatherIcon'),
            notification: document.getElementById('notification'),
            notificationMessage: document.getElementById('notificationMessage'),
            loginError: document.getElementById('loginError'),
            signupError: document.getElementById('signupError'),
            signupNameInput: document.getElementById('signupName'),
            signupAdditionalFields: document.getElementById('signup-additional-fields'),
            chatbotMessages: document.getElementById('chatbotMessages'),
            chatbotInput: document.getElementById('chatbotInput'),
            sendChatBtn: document.getElementById('sendChatBtn'),
        },

        init() {
            this.loadState();
            this.bindEvents();
            this.switchForm(true);
            this.initGoogleSignIn();
            this.checkVerificationRedirect();
        },

        checkVerificationRedirect() {
            const params = new URLSearchParams(window.location.search);
            if (params.get('verified') === '1') {
                history.replaceState(null, '', '/');
                this.showNotification('Email verified! You can now sign in.', 4000);
            }
        },

        bindEvents() {
            this.elements.showSignup.addEventListener('click', () => this.switchForm(false));
            this.elements.showLogin.addEventListener('click', () => this.switchForm(true));
            this.elements.loginFormElement.addEventListener('submit', this.handleLogin.bind(this));
            this.elements.signupFormElement.addEventListener('submit', this.handleSignup.bind(this));
            this.elements.logoutBtn.addEventListener('click', this.logout.bind(this));
            this.elements.addTaskBtn.addEventListener('click', this.addTask.bind(this));
            this.elements.taskInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.addTask());
            this.elements.addNoteBtn.addEventListener('click', this.addNote.bind(this));
            this.elements.startTimer.addEventListener('click', this.startTimer.bind(this));
            this.elements.pauseTimer.addEventListener('click', this.pauseTimer.bind(this));
            this.elements.resetTimer.addEventListener('click', this.resetTimer.bind(this));
            this.elements.signupNameInput.addEventListener('focus', () => {
                this.elements.signupAdditionalFields.classList.add('fields-visible');
            });
            this.elements.sendChatBtn.addEventListener('click', this.handleChat.bind(this));
            this.elements.chatbotInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleChat());
        },

        initGoogleSignIn() {
            this.state.googleClientId = GOOGLE_CLIENT_ID;
            if (typeof google !== 'undefined') {
                this.renderGoogleButtons();
            } else {
                window.addEventListener('gsi-loaded', () => this.renderGoogleButtons(), { once: true });
            }
        },

        renderGoogleButtons() {
            if (!this.state.googleClientId || typeof google === 'undefined') return;

            google.accounts.id.initialize({
                client_id: this.state.googleClientId,
                callback: this.handleGoogleCredential.bind(this),
            });

            const render = (id, text) => {
                const el = document.getElementById(id);
                if (el) {
                    google.accounts.id.renderButton(el, {
                        theme: 'filled_black',
                        size: 'large',
                        width: 360,
                        text,
                    });
                }
            };

            render('google-login-btn', 'signin_with');
            render('google-signup-btn', 'signup_with');
        },

        handleGoogleCredential(response) {
            try {
                // Decode the Google ID token (JWT) directly — no backend call needed.
                // The token arrives from Google's secure Sign-In flow so it's already trusted.
                const payload = JSON.parse(atob(response.credential.split('.')[1]));
                const { name, email, picture, sub: googleId } = payload;

                let user = this.state.users.find(u => u.email === email || u.googleId === googleId);
                const isNewUser = !user;
                if (user) {
                    user.googleId = googleId;
                    user.picture = picture;
                    user.verified = true;
                } else {
                    user = { name, email, googleId, picture, verified: true, tasks: [], notes: [] };
                    this.state.users.push(user);
                }
                this.saveState();
                if (isNewUser) this.sendConfirmationEmail(name, email);
                this.login(user);
            } catch (err) {
                console.error('Google login error:', err);
                this.showNotification('Google Sign-In failed. Please try again.');
            }
        },

        // IMPORTANT: This is a mock user system. Storing plain text passwords
        // in localStorage is extremely insecure and should NEVER be done in a real application.
        saveState() {
            localStorage.setItem('zenDeskProState_v3', JSON.stringify({ users: this.state.users }));
        },

        loadState() {
            const state = JSON.parse(localStorage.getItem('zenDeskProState_v3'));
            if (state) {
                this.state.users = state.users || [];
            }
        },

        showNotification(message, duration = 3000) {
            this.elements.notificationMessage.textContent = message;
            this.elements.notification.classList.remove('hidden');
            return new Promise(resolve => {
                setTimeout(() => {
                    this.elements.notification.classList.add('hidden');
                    resolve();
                }, duration);
            });
        },

        switchForm(showLogin) {
            this.elements.loginError.textContent = '';
            this.elements.signupError.textContent = '';
            this.elements.loginFormElement.reset();
            this.elements.signupFormElement.reset();

            if (showLogin) {
                this.elements.signupAdditionalFields.classList.remove('fields-visible');
            }

            this.elements.loginForm.classList.toggle('hidden', !showLogin);
            this.elements.signupForm.classList.toggle('hidden', showLogin);
        },

        handleLogin(e) {
            e.preventDefault();
            this.elements.loginError.textContent = '';
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            const user = this.state.users.find(u => u.email === email);

            if (!user) {
                this.elements.loginError.textContent = 'No account found with that email.';
                return;
            }

            if (!user.password && user.googleId) {
                this.elements.loginError.textContent = 'This account uses Google Sign-In. Please use the Google button below.';
                return;
            }

            if (user.password !== password) {
                this.elements.loginError.textContent = 'Incorrect password. Please try again.';
                return;
            }

            if (user.verified === false) {
                this.elements.loginError.textContent = 'Please verify your email before signing in. Check your inbox.';
                return;
            }

            this.login(user);
        },

        async handleSignup(e) {
            e.preventDefault();
            this.elements.signupError.textContent = '';
            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;

            if (!name || !email || !password) {
                this.elements.signupError.textContent = "Please fill out all fields.";
                return;
            }

            if (password !== document.getElementById('confirmPassword').value) {
                this.elements.signupError.textContent = "Passwords do not match!";
                return;
            }

            if (this.state.users.some(u => u.email === email)) {
                this.elements.signupError.textContent = "An account with this email already exists.";
                return;
            }

            this.state.users.push({ name, email, password, verified: false, tasks: [], notes: [] });
            this.saveState();

            this.sendConfirmationEmail(name, email);

            this.elements.signupForm.classList.add('hidden');
            this.showNotification('Account created! Check your email to verify before signing in.', 4000)
                .then(() => this.switchForm(true));
        },

        sendConfirmationEmail(name, email) {
            fetch(`${BACKEND_URL}/api/send-confirmation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email }),
            }).catch(err => console.warn('Confirmation email could not be sent:', err));
        },

        login(user) {
            this.state.activeUserEmail = user.email;
            this.showDashboard();
        },

        logout() {
            this.state.activeUserEmail = null;
            this.clearTimer();
            clearInterval(this.state.dateTimeInterval);
            this.state.dateTimeInterval = null;
            window.speechSynthesis.cancel();
            this.elements.dashboard.classList.remove('active');
            this.switchForm(true);
        },

        getActiveUser() {
            return this.state.users.find(u => u.email === this.state.activeUserEmail);
        },

        showDashboard() {
            this.elements.loginForm.classList.add('hidden');
            this.elements.signupForm.classList.add('hidden');
            this.elements.dashboard.classList.add('active');
            this.updateUserInfo();
            this.renderAll();
            this.fetchAllApis();
            this.updateDateTime();
            this.updateTimerDisplay();
        },



        handleChat() {
            const userMessage = this.elements.chatbotInput.value.trim();
            if (!userMessage) return;

            this.addMessageToChat(userMessage, 'user');
            this.elements.chatbotInput.value = '';

            this.getGeminiResponse(userMessage);
        },

        addMessageToChat(message, sender) {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message', `${sender}-message`);

            let displayMessage = message;
            const jsonPart = message.match(/```json\n[\s\S]*?\n```/);
            if (jsonPart) {
                displayMessage = message.replace(jsonPart[0], '').trim() || 'Executing command...';
            }

            messageElement.textContent = displayMessage;
            this.elements.chatbotMessages.appendChild(messageElement);
            this.elements.chatbotMessages.scrollTop = this.elements.chatbotMessages.scrollHeight;
        },

        async getGeminiResponse(prompt) {
            this.addMessageToChat("Thinking...", 'bot');

            try {
                const response = await fetch(`${BACKEND_URL}/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message: prompt })
                });

                if (!response.ok) {
                    throw new Error(`API request failed with status: ${response.status}`);
                }

                const data = await response.json();
                const botResponse = data.message;

                // Remove the "Thinking..." message
                const thinkingMessage = this.elements.chatbotMessages.lastChild;
                if (thinkingMessage && thinkingMessage.textContent === "Thinking...") {
                    this.elements.chatbotMessages.removeChild(thinkingMessage);
                }

                this.addMessageToChat(botResponse, 'bot');

            } catch (error) {
                console.error("Error fetching Gemini response:", error);
                const thinkingMessage = this.elements.chatbotMessages.lastChild;
                if (thinkingMessage && thinkingMessage.textContent === "Thinking...") {
                    this.elements.chatbotMessages.removeChild(thinkingMessage);
                }
                this.addMessageToChat("Sorry, I encountered an error. Please check the console for details.", 'bot');
            }
        },

        updateUserInfo() {
            const user = this.getActiveUser();
            if (!user) return;
            this.elements.userName.textContent = user.name;
            if (user.picture) {
                const img = document.createElement('img');
                img.src = user.picture;
                img.alt = user.name;
                img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
                this.elements.userAvatar.innerHTML = '';
                this.elements.userAvatar.appendChild(img);
            } else {
                this.elements.userAvatar.textContent = user.name.charAt(0).toUpperCase();
            }
        },

        updateDateTime() {
            clearInterval(this.state.dateTimeInterval);
            const update = () => {
                if (this.elements.dateTime) {
                    this.elements.dateTime.textContent = new Date().toLocaleString();
                }
            };
            update();
            this.state.dateTimeInterval = setInterval(update, 60000);
        },

        updateGreeting() {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? "Good Morning!" : hour < 18 ? "Good Afternoon!" : "Good Evening!";
            this.elements.greeting.textContent = greeting;
        },

        renderTasks() {
            const user = this.getActiveUser();
            if (!user) return;
            const taskHtml = user.tasks.length
                ? user.tasks.map(t => `
                    <div class="task-item ${t.completed ? 'completed' : ''} priority-${t.priority}">
                        <span>${t.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>
                        <div class="task-actions">
                            <button title="Complete" onclick="appProxy.toggleTask(${t.id})"><i class="fas fa-check"></i></button>
                            <button title="Delete" onclick="appProxy.deleteTask(${t.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`).join('')
                : `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No tasks yet. Add one above!</div>`;
            this.elements.taskList.innerHTML = taskHtml;
        },

        addTask() {
            const user = this.getActiveUser();
            if (!user) return;
            const text = this.elements.taskInput.value.trim();
            if (!text) return;
            user.tasks.unshift({
                id: Date.now(),
                text,
                completed: false,
                priority: this.elements.taskPriority.value
            });
            this.elements.taskInput.value = '';
            this.renderAll();
        },

        toggleTask(id) {
            const user = this.getActiveUser();
            if (!user) return;
            const task = user.tasks.find(t => t.id === id);
            if (task) task.completed = !task.completed;
            this.renderAll();
        },

        deleteTask(id) {
            const user = this.getActiveUser();
            if (!user) return;
            user.tasks = user.tasks.filter(t => t.id !== id);
            this.renderAll();
        },

        renderNotes() {
            const user = this.getActiveUser();
            if (!user) return;
            const notesHtml = user.notes.length
                ? user.notes.map(n => `
                    <div class="note-item">
                        <p>${n.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
                        <button title="Delete Note" onclick="appProxy.deleteNote(${n.id})"><i class="fas fa-trash"></i></button>
                    </div>`).join('')
                : `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No notes yet.</div>`;
            this.elements.notesList.innerHTML = notesHtml;
        },

        addNote() {
            const user = this.getActiveUser();
            if (!user) return;
            const text = this.elements.noteInput.value.trim();
            if (!text) return;
            user.notes.unshift({ id: Date.now(), text });
            this.elements.noteInput.value = '';
            this.renderAll();
        },

        deleteNote(id) {
            const user = this.getActiveUser();
            if (!user) return;
            user.notes = user.notes.filter(n => n.id !== id);
            this.renderAll();
        },

        updateTimerDisplay() {
            const minutes = Math.floor(this.state.timerSeconds / 60);
            const seconds = this.state.timerSeconds % 60;
            this.elements.timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        },

        startTimer() {
            if (this.state.isTimerRunning || this.state.timerSeconds <= 0) return;
            this.state.isTimerRunning = true;
            this.state.timerInterval = setInterval(() => {
                this.state.timerSeconds--;
                this.updateTimerDisplay();
                if (this.state.timerSeconds <= 0) {
                    this.pauseTimer();
                    this.showNotification("Timer finished!", 4000);
                }
            }, 1000);
        },

        pauseTimer() {
            this.state.isTimerRunning = false;
            clearInterval(this.state.timerInterval);
        },

        resetTimer() {
            this.pauseTimer();
            this.state.timerSeconds = 1500;
            this.updateTimerDisplay();
        },

        clearTimer() {
            this.pauseTimer();
            this.state.timerSeconds = 1500;
            this.updateTimerDisplay();
        },

        fetchAllApis() {
            this.updateGreeting();
            this.fetchQuote();
            this.fetchWeather();
        },

        fetchQuote() {
            const quotes = [
                { text: "The measure of intelligence is the ability to change.", author: "A. Einstein" },
                { text: "The best way to predict the future is to create it.", author: "P. Drucker" },
                { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" }
            ];
            const quote = quotes[Math.floor(Math.random() * quotes.length)];
            this.elements.quoteText.textContent = `"${quote.text}"`;
            this.elements.quoteAuthor.textContent = `- ${quote.author}`;
        },

        fetchWeather(city = 'Delhi') {
            fetch(`https://wttr.in/${city}?format=j1`)
                .then(response => response.json())
                .then(data => {
                    this.elements.weatherTemp.textContent = `${data.current_condition[0].temp_C}°C`;
                    this.elements.weatherLocation.textContent = data.nearest_area[0].areaName[0].value;
                    const weatherDesc = data.current_condition[0].weatherDesc[0].value.toLowerCase();
                    if (weatherDesc.includes('sun') || weatherDesc.includes('clear')) this.elements.weatherIcon.className = 'fas fa-sun';
                    else if (weatherDesc.includes('rain')) this.elements.weatherIcon.className = 'fas fa-cloud-showers-heavy';
                    else if (weatherDesc.includes('cloud')) this.elements.weatherIcon.className = 'fas fa-cloud';
                    else if (weatherDesc.includes('thunder')) this.elements.weatherIcon.className = 'fas fa-bolt';
                    else this.elements.weatherIcon.className = 'fas fa-cloud-sun';
                })
                .catch(error => {
                    console.error("Error fetching weather:", error);
                    this.elements.weatherTemp.textContent = 'N/A';
                });
        },


        // --- Voice Service ---
        toggleVoice() {
            if (this.state.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        },

        startListening() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                this.showNotification("Speech recognition is not supported in this browser.");
                return;
            }

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'en-US';
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                this.state.isListening = true;
                this.elements.voiceBtn.classList.add('listening');
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.elements.chatbotInput.value = transcript;
                this.handleChat();
            };

            this.recognition.onerror = (event) => {
                console.error("Speech recognition error:", event.error);
                this.stopListening();
            };

            this.recognition.onend = () => {
                this.state.isListening = false;
                this.elements.voiceBtn.classList.remove('listening');
            };

            this.recognition.start();
        },

        stopListening() {
            this.state.isListening = false;
            this.elements.voiceBtn.classList.remove('listening');
            if (this.recognition) {
                this.recognition.stop();
            }
        },

        speak(text) {
            const speechText = text.replace(/```json[\s\S]*?```/g, '').trim();
            if (!speechText) return;

            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(speechText);
            utterance.onstart = () => { this.state.isSpeaking = true; };
            utterance.onend = () => { this.state.isSpeaking = false; };
            window.speechSynthesis.speak(utterance);
        },


        renderAll() {
            this.renderTasks();
            this.renderNotes();
            this.saveState();
        }
    };

    // Expose methods to the global proxy
    window.appProxy.toggleTask = App.toggleTask.bind(App);
    window.appProxy.deleteTask = App.deleteTask.bind(App);
    window.appProxy.deleteNote = App.deleteNote.bind(App);

    App.init();
});
