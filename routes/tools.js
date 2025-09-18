const app = require("express").Router();
const rateLimit = require("express-rate-limit");
const NodeCache = require("node-cache");

console.success("[Tools] /tools router loaded.".brightYellow);

// Cache for AI usage tracking
const toolsAiUsageCache = new NodeCache({ stdTTL: 86400 });

// Rate limiter for AI generation
const toolsAiLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 5, // Limit each user to 5 requests per window for tools
    message: "Przekroczono limit 5 generowań dziennie na użytkownika.",
    keyGenerator: (req) => req.user?.id || req.ip,
});

app.get("/tools", async (req, res) => {
    if (!req.user)
        return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            referrerInfo: null,
            message: "Musisz być zalogowany, aby korzystać z narzędzi.",
        });

    // Check if user has any servers added to the site
    const userServers = await global.serversdata.find({ ownerID: req.user.id });

    if (userServers.length === 0) {
        return res.render("404.ejs", {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
            referrerInfo: null,
            message:
                "Aby korzystać z narzędzi, musisz mieć dodany przynajmniej jeden serwer na stronie.",
        });
    }

    res.render("tools/index", {
        bot: global.client ? global.client : null,
        path: req.path,
        user: req.isAuthenticated() ? req.user : null,
        req: req,
        referrerInfo: null,
        userServers: userServers,
    });
});

// API endpoint to send webhook embed
app.post("/api/send-webhook", async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        const { webhookUrl, embedsData, messageContent, webhookName, webhookAvatar } = req.body;

        if (!webhookUrl || (!embedsData?.length && !messageContent)) {
            return res
                .status(400)
                .json({ error: "Webhook URL i treść lub embedy są wymagane" });
        }

        // Validate webhook URL
        if (!webhookUrl.includes("discord.com/api/webhooks/")) {
            return res
                .status(400)
                .json({ error: "Nieprawidłowy URL webhooka Discord" });
        }

        const { fetch } = require("undici");

        const webhookPayload = {};

        if (messageContent) webhookPayload.content = messageContent;
        if (embedsData?.length) webhookPayload.embeds = embedsData;
        if (webhookName) webhookPayload.username = webhookName;
        if (webhookAvatar) webhookPayload.avatar_url = webhookAvatar;

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(webhookPayload),
        });

        if (response.ok) {
            res.json({
                success: true,
                message: "Wiadomość została wysłana pomyślnie!",
            });
        } else {
            const errorText = await response.text();
            res.status(400).json({ error: `Błąd Discord API: ${errorText}` });
        }
    } catch (error) {
        console.error("Error sending webhook:", error);
        res.status(500).json({
            error: "Wystąpił błąd podczas wysyłania webhooka",
        });
    }
});

// API endpoint to generate server rules using AI
app.post("/api/generate-rules", toolsAiLimiter, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        // Check cache for user usage
        const cacheKey = `tools_ai_usage_${req.user.id}`;
        const usageCount = toolsAiUsageCache.get(cacheKey) || 0;

        if (usageCount >= 5) {
            return res.status(429).json({
                error: "Osiągnięto dzienny limit 5 generowań. Spróbuj jutro.",
            });
        }

        const { serverType, additionalInfo } = req.body;

        if (!serverType) {
            return res.status(400).json({ error: "Typ serwera jest wymagany" });
        }

        // Track usage
        toolsAiUsageCache.set(cacheKey, usageCount + 1);

        // Initialize Google Gemini
        const { GoogleGenAI } = require("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

        const prompt = `Wygeneruj zestaw reguł dla serwera Discord typu: ${serverType}. ${additionalInfo ? `Dodatkowe informacje: ${additionalInfo}` : ""} 

        Stwórz kompletny zestaw reguł (8-15 zasad) w języku polskim, które będą jasne, konkretne i profesjonalne. Uwzględnij standardowe zasady Discord oraz specyficzne dla typu serwera. 

        Format: ponumerowane zasady, każda w osobnej linii. NIE używaj formatowania Markdown.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: prompt,
            safetySettings: [
                {
                    category: "HARM_CATEGORY_DANGEROUS",
                    threshold: "BLOCK_ONLY_HIGH",
                },
            ],
        });

        const rules = response.text
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/#{1,6}\s*/g, "");

        res.json({
            success: true,
            rules: rules,
            remaining: 5 - (usageCount + 1),
        });
    } catch (error) {
        console.error("Error generating rules:", error);
        res.status(500).json({
            error: error.message || "Wystąpił błąd podczas generowania reguł",
        });
    }
});

// API endpoint to generate embed using AI
app.post("/api/generate-embed", toolsAiLimiter, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        // Check cache for user usage
        const cacheKey = `tools_ai_usage_${req.user.id}`;
        const usageCount = toolsAiUsageCache.get(cacheKey) || 0;

        if (usageCount >= 5) {
            return res.status(429).json({
                error: "Osiągnięto dzienny limit 5 generowań. Spróbuj jutro.",
            });
        }

        const { description } = req.body;

        if (
            !description ||
            typeof description !== "string" ||
            description.length > 500
        ) {
            return res
                .status(400)
                .json({ error: "Opis jest wymagany (max 500 znaków)" });
        }

        // Track usage
        toolsAiUsageCache.set(cacheKey, usageCount + 1);

        // Initialize Google Gemini
        const { GoogleGenAI } = require("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

        const prompt = `Na podstawie opisu: "${description}" 

        Wygeneruj dane dla embed Discord w formacie JSON. Embed powinien być atrakcyjny i profesjonalny.

        Zwróć TYLKO czysty JSON w formacie:
        {
            "title": "tytuł embed (max 256 znaków)",
            "description": "opis embed (max 4096 znaków)",
            "color": "kolor hex bez # (np. 5865f2)",
            "author": {
                "name": "nazwa autora (opcjonalne)"
            },
            "footer": {
                "text": "footer (opcjonalne)"
            }
        }

        NIE dodawaj żadnego tekstu poza JSON. Wszystkie wartości tekstowe w języku polskim.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: prompt,
            safetySettings: [
                {
                    category: "HARM_CATEGORY_DANGEROUS",
                    threshold: "BLOCK_ONLY_HIGH",
                },
            ],
        });

        let embedData;
        try {
            // Clean the response to extract JSON
            const cleanedResponse = response.text
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
            embedData = JSON.parse(cleanedResponse);
        } catch (parseError) {
            return res
                .status(500)
                .json({ error: "Błąd parsowania odpowiedzi AI" });
        }

        res.json({
            success: true,
            embedData: embedData,
            remaining: 5 - (usageCount + 1),
        });
    } catch (error) {
        console.error("Error generating embed:", error);
        res.status(500).json({
            error: error.message || "Wystąpił błąd podczas generowania embed",
        });
    }
});

// API endpoint to save embed template
app.post("/api/save-template", async (req, res) => {
    try {
        if (!req.user) {
            console.error("User not authenticated in save-template");
            return res.status(401).json({ error: "Musisz być zalogowany aby zapisać szablon" });
        }

        const { name, templateData } = req.body;

        if (!name || !templateData) {
            return res.status(400).json({
                error: "Nazwa szablonu i dane są wymagane"
            });
        }

        const UserProfile = require("../database/models/profile");

        let userProfile = await UserProfile.findOne({ userID: req.user.id });

        // Create profile if doesn't exist
        if (!userProfile) {
            userProfile = new UserProfile({
                userID: req.user.id,
                embedTemplates: []
            });
        }

        // Initialize embedTemplates array if it doesn't exist
        if (!userProfile.embedTemplates) {
            userProfile.embedTemplates = [];
        }

        // Check if template with this name already exists
        const existingTemplate = userProfile.embedTemplates.find(template => template.name === name);
        if (existingTemplate) {
            return res.status(400).json({ error: "Szablon o tej nazwie już istnieje" });
        }

        // Add new template
        userProfile.embedTemplates.push({
            name: name,
            embedData: templateData,
            createdAt: new Date(),
        });

        await userProfile.save();

        res.json({
            success: true,
            message: "Szablon został zapisany pomyślnie",
        });
    } catch (error) {
        console.error("Error saving template:", error);
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
        res.status(500).json({
            error: "Wystąpił błąd podczas zapisywania szablonu: " + error.message,
        });
    }
});

// API endpoint to get user templates
app.get("/api/get-templates", async (req, res) => {
    try {
        if (!req.user) {
            console.log("Get templates: User not authenticated");
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log(`Get templates: Fetching templates for user ${req.user.id}`);
        
        const UserProfile = require("../database/models/profile");
        
        // Sprawdź czy model jest właściwie załadowany
        if (!UserProfile) {
            console.error("UserProfile model not loaded");
            return res.status(500).json({
                error: "Model nie został załadowany",
                success: false
            });
        }

        const userProfile = await UserProfile.findOne({ userID: req.user.id }).lean();

        console.log(`Get templates: Found profile:`, userProfile ? 'Yes' : 'No');
        console.log(`Get templates: Templates count:`, userProfile?.embedTemplates?.length || 0);

        if (!userProfile || !userProfile.embedTemplates) {
            console.log("Get templates: No profile or templates found, returning empty array");
            return res.json({
                success: true,
                templates: [],
            });
        }

        const templates = userProfile.embedTemplates.map(template => {
            // Sprawdź strukturę szablonu
            if (!template.name) {
                console.warn("Template without name found:", template);
                return null;
            }
            
            return {
                name: template.name,
                templateData: template.embedData || template.templateData, // Support both field names
                createdAt: template.createdAt
            };
        }).filter(template => template !== null); // Usuń null templates

        console.log(`Get templates: Successfully returning ${templates.length} templates`);

        res.json({
            success: true,
            templates: templates,
        });
    } catch (error) {
        console.error("Error getting templates:", error);
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
        
        // Zwróć bardziej szczegółowy błąd
        res.status(500).json({
            error: `Wystąpił błąd podczas pobierania szablonów: ${error.message}`,
            success: false,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// API endpoint to delete template
app.delete("/api/delete-template/:templateName", async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        const templateName = req.params.templateName;

        const UserProfile = require("../database/models/profile");
        const userProfile = await UserProfile.findOne({ userID: req.user.id });

        if (!userProfile || !userProfile.embedTemplates) {
            return res.status(404).json({ error: "Szablon nie znaleziony" });
        }

        const templateIndex = userProfile.embedTemplates.findIndex(
            (template) => template.name === templateName,
        );

        if (templateIndex === -1) {
            return res.status(404).json({ error: "Szablon nie znaleziony" });
        }

        userProfile.embedTemplates.splice(templateIndex, 1);
        await userProfile.save();

        res.json({
            success: true,
            message: "Szablon został usunięty",
        });
    } catch (error) {
        console.error("Error deleting template:", error);
        res.status(500).json({
            error: "Wystąpił błąd podczas usuwania szablonu",
        });
    }
});

// API endpoint to check AI usage for tools
app.get("/api/check-tools-ai-usage", async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        const cacheKey = `tools_ai_usage_${req.user.id}`;
        const usageCount = toolsAiUsageCache.get(cacheKey) || 0;

        res.json({
            success: true,
            used: usageCount,
            remaining: 5 - usageCount,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;