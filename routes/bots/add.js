const app = require('express').Router();
const { fetch } = require("undici");
const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

console.success('[Bots] /bots/new.js router loaded.'.brightYellow);

app.get('/bots/new', async (req, res) => {
    if (!req.user) {
        return res.redirect('/login'); // Redirect to login page
    }



    try {
        const user = await global.client.users.fetch(req.user.id);
        if (!user.avatar) {
            return res.render('404.ejs', {
                message: 'Aby dodać bota, musisz mieć zdjęcie profilowe.',
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
            });
        }

        if (user.createdTimestamp + 2592000000 > Date.now()) {
            return res.render('404.ejs', {
                message: 'Aby dodać bota, musisz posiadać konto przez co najmniej 30 dni.',
                bot: global.client ? global.client : null,
                path: req.path,
                user: req.isAuthenticated() ? req.user : null,
                req: req,
            });
        }
		
		

        res.render('bots/new', {
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
        });
    } catch (error) {
        console.error(error);
        return res.render('404.ejs', {
            message: 'Nie udało się zweryfikować danych użytkownika. Spróbuj ponownie później.',
            bot: global.client ? global.client : null,
            path: req.path,
            user: req.isAuthenticated() ? req.user : null,
            req: req,
        });
    }
});

app.post('/bots/new', async (req, res) => {
    try {
        if (!req.user) return res.render('404.ejs', { message: 'Musisz się zalogować, aby dodać bota.' });



        const {
            botID, appID, coowners, prefix, inviteURL, githubURL, websiteURL, donateURL, supportURL, webhookURL,
            shortDesc, longDesc, tags, faq, framework, commands // Dodano faq
        } = req.body;

        if (!botID) return error(res, 'Proszę podać ID bota.');
        if (!appID) return error(res, 'Proszę podać ID aplikacji.');

        const botdata = await botsdata.findOne({ botID });
        if (botdata) return error(res, 'Ten bot już znajduje się w bazie danych.');

        let botUser;
        try {
            botUser = await global.client.users.fetch(botID);
            if (!botUser.bot) return error(res, 'ID nie jest ID bota.');
        } catch (e) {
            return error(res, 'Nieprawidłowy identyfikator bota.');
        }
		        // Framework validation (move this after you destructure the variables)
        if (!framework) {
            return error(res, 'Proszę wybrać framework/language bota.');
        }
        if (!['Discord.js', 'Discord.py', 'Eris', 'JDA', 'Discord4J', 'Disnake', 'Nextcord', 'Pycord', 'Other'].includes(framework)) {
            return res.json({ error: true, message: 'Wybierz poprawny framework z listy.' });
        }

        let application;
        try {
            application = await global.client.rest.get(`/applications/${appID}/rpc`);
            if (!application.bot_public) return error(res, 'Bot nie jest publiczny.');
        } catch (e) {
            return error(res, 'Nieprawidłowy ID aplikacji.');
        }

		
		if (!tags || typeof (tags) !== 'object' || !Array.isArray(tags)) return res.json({ error: true, message: '<strong>[Tagi]</strong> są wymagane.' });
        if (!tags.every(tag => config.website.botTags.includes(tag))) return res.json({ error: true, message: `<strong>[Tagi]</strong> musi być jednym z następujących: ${config.website.botTags.map(tag => `<code>${tag}</code>`).join(', ')}` });
        if (tags.length < 3) return res.json({ error: true, message: '<strong>[Tagi]</strong> musi być co najmniej 3.' });
        if (tags.length > 20) return res.json({ error: true, message: '<strong>[Tagi]</strong> nie możesz przekroczyć 20 tagów.' });
		
        // Przetwarzanie FAQ
        let parsedFAQ = [];
        if (faq && Array.isArray(faq)) {
            faq.forEach(item => {
                if (item.question && item.answer) {
                    parsedFAQ.push({ question: item.question, answer: item.answer });
                }
            });
        }
		
		        // Validate FAQ length
        if (faq && Array.isArray(faq)) {
            const invalidFaq = faq.filter(item => item.question.length > 50 || item.answer.length > 100);
            if (invalidFaq.length > 0) {
                return error(res, 'Pytanie nie może mieć więcej niż 50 znaków, a odpowiedź nie więcej niż 100.');
            }
        }
		
		// Przetwarzanie Komend
        let parsedCommands = [];
        if (commands && Array.isArray(commands)) {
            commands.forEach(cmd => {
                if (cmd.name && cmd.description) {
                    parsedCommands.push({ name: cmd.name, description: cmd.description });
                }
            });
        }
		
		        // Validate commands length
        if (commands && Array.isArray(commands)) {
            const invalidCommands = commands.filter(cmd => cmd.name.length > 30 || cmd.description.length > 50);
            if (invalidCommands.length > 0) {
                return error(res, 'Nazwa komendy nie może mieć więcej niż 30 znaków, a opis nie więcej niż 50.');
            }
        }

        await new botsdata({
            username: botUser.username,
            botID: botID,
            appID: appID,
            ownerID: req.user.id,
            avatar: botUser.displayAvatarURL({ format: 'png', size: 512 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png',
            coowners: coowners,
            prefix: prefix,
            inviteURL: inviteURL,
            githubURL: githubURL,
            websiteURL: websiteURL,
            supportURL: supportURL,
            webhookURL: webhookURL,
            shortDesc: shortDesc,
            longDesc: longDesc,
			framework: framework,
            tags: tags,
            faq: parsedFAQ, // Zapisuje FAQ w bazie danych
			commands: parsedCommands,
            date: Date.now(),
            token: require('crypto').randomBytes(64).toString('hex'),
        }).save();

        res.json({
    success: true,
    botID: botID,  // Dodaj to
    message: `Bot został pomyślnie dodany. <a href='/bot/${botID}' class="btn btn-primary">Wyświetl Bota</a>`
});


        global.client.channels.cache.get(global.config.server.channels.botlogs).send({
            content: `<@&${global.config.server.roles.botReviewer}> | <@${req.user.id}>` + (coowners?.length ? `, ${coowners.map(u => `<@${u}>`).join(', ')}` : '') + ` właśnie dodał ${botUser.username}\n<${global.config.website.url}/bot/${botID}>`,
            allowedMentions: { users: [req.user.id].concat(coowners || []), roles: [global.config.server.roles.botReviewer] }
        });
    } catch (e) {
        console.error(e);
        return error(res, 'Wystąpił błąd, proszę spróbować ponownie później. (Administratorzy zostali powiadomieni)');
    }
});

// Cache for bot AI usage
const botAiUsageCache = new NodeCache({ stdTTL: 86400 });

// Rate limiter for bot generation
const botAiGenerationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 2, // Limit each user to 2 requests per window
  message: 'Przekroczono limit 2 generowań dziennie na użytkownika.',
  keyGenerator: (req) => req.user?.id || req.ip
});

// Endpoint to check usage
app.get('/api/check-bot-ai-usage', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const cacheKey = `bot_ai_usage_${req.user.id}`;
    const usageCount = botAiUsageCache.get(cacheKey) || 0;
    
    res.json({
      success: true,
      used: usageCount,
      remaining: 2 - usageCount
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to generate bot description
app.post('/api/generate-bot-description', botAiGenerationLimiter, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // Check cache
    const cacheKey = `bot_ai_usage_${req.user.id}`;
    const usageCount = botAiUsageCache.get(cacheKey) || 0;
    
    if (usageCount >= 2) {
      return res.status(429).json({ 
        error: 'Osiągnięto dzienny limit 2 generowań. Spróbuj jutro.' 
      });
    }

    const { prompt, framework } = req.body;
    
    // Validate input
    if (!prompt || typeof prompt !== 'string' || prompt.length > 500) {
      return res.status(400).json({ error: 'Nieprawidłowa podpowiedź' });
    }

    // Track usage
    botAiUsageCache.set(cacheKey, usageCount + 1);
    
    // Initialize Google Gemini
    const { GoogleGenAI } = require("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

    // Generate descriptions
    let shortDesc = '';
    let longDesc = '';
    
    // Generate short description (50-140 chars)
    const shortResponse = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: `${prompt} Wygeneruj krótki opis (50-100 znaków) bota Discord w języku polskim. Uwzględnij framework: ${framework}. Opis powinien być zwięzły i zachęcający. NIE używaj formatowania Markdown - tylko czysty tekst.`,
      safetySettings: [{ category: "HARM_CATEGORY_DANGEROUS", threshold: "BLOCK_ONLY_HIGH" }]
    });
    shortDesc = shortResponse.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').substring(0, 140);
    
    // Generate long description (200-5000 chars without Markdown)
    const longResponse = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: `${prompt} Wygeneruj długi opis (200-2000 znaków) bota Discord w języku polskim. Uwzględnij framework: ${framework}. Opis powinien zawierać sekcje: "O bocie", "Funkcje", "Jak używać". NIE używaj formatowania Markdown - używaj tylko zwykłego tekstu z podziałem na akapity.`,
      safetySettings: [{ category: "HARM_CATEGORY_DANGEROUS", threshold: "BLOCK_ONLY_HIGH" }]
    });
    longDesc = longResponse.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/#{1,6}\s*/g, '').substring(0, 5000);
    
    res.json({
      success: true,
      shortDesc: shortDesc,
      longDesc: longDesc,
      remaining: 2 - (usageCount + 1)
    });
    
  } catch (error) {
    console.error('Error generating bot description:', error);
    res.status(500).json({ 
      error: error.message || 'Wystąpił błąd podczas generowania opisu' 
    });
  }
});

module.exports = app;