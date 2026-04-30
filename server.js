require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(__dirname));

app.post('/chat', async (req, res) => {
    const { message, history } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'AIzaSyDBNVaJKPdKs9MbZYMx5z38vPQsNnHQ4S0') {
        return res.status(500).json({ error: 'API key not configured. Please add your GEMINI_API_KEY to the .env file.' });
    }

    // Using Gemini 1.5 Flash for faster and more capable automation
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: history || [{
                parts: [{
                    text: message
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
            }
        });

        if (response.data.candidates && response.data.candidates[0].content) {
            const botResponse = response.data.candidates[0].content.parts[0].text;
            res.json({ message: botResponse });
        } else {
            throw new Error('Invalid response format from Gemini API');
        }

    } catch (error) {
        console.error("Error fetching Gemini response:", error.response ? JSON.stringify(error.response.data) : error.message);
        res.status(500).json({ 
            error: 'AI communication error.',
            details: error.response ? error.response.data : error.message
        });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
