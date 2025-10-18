require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(__dirname));

app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'AIzaSyDBNVaJKPdKs9MbZYMx5z38vPQsNnHQ4S0') {
        return res.status(500).json({ error: 'API key not configured.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: [{
                parts: [{
                    text: userMessage
                }]
            }]
        });

        const botResponse = response.data.candidates[0].content.parts[0].text;
        res.json({ message: botResponse });

    } catch (error) {
        console.error("Error fetching Gemini response:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Sorry, I encountered an error.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
