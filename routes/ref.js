const app = require('express').Router();
const UserProfile = require('../database/models/profile');

console.success('[Ref] /ref router loaded.');
const rateLimit = require('express-rate-limit');

const referralLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 10, // maksymalnie 10 żądań na IP
    message: 'Zbyt wiele prób. Spróbuj ponownie później.',
    standardHeaders: true,
    legacyHeaders: false,
});


app.get('/ref/:code', (req, res) => {
    const referralCode = req.params.code.toUpperCase();

    // Opcjonalna walidacja formatu kodu
    if (!/^[A-Z0-9]{4,6}$/.test(referralCode)) {
        return res.redirect('/');
    }

    res.send(`<!DOCTYPE html>
<html lang="pl">
<head>
  <title>Znajdź Najlepsze Polskie Serwery Discord | Discordzik.pl</title>
  <link rel="icon" href="/assets/img/favicon.ico" type="image/x-icon">
  <link rel="shortcut icon" href="/assets/img/favicon.ico" type="image/x-icon">
  <meta charset="utf-8">
  <meta http-equiv="content-type" content="text/html;charset=utf-8" />
  <link rel="stylesheet" href="/assets/css/main.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/slick-carousel/slick/slick.css"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/slick-carousel/slick/slick-theme.css"/>
  <link rel="preload" href="/assets/img/banner.png" as="image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="preconnect" href="https://unpkg.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"></noscript>

  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #20232a;
      color: #fff;
    }
    .container {
      padding: 1rem;
    }
    a {
      color: #8b5cf6;
      text-decoration: none;
    }
  </style>

  <meta name="google-adsense-account" content="ca-pub-9136474966764887">
  <meta name="title" content="Znajdź Najlepsze Polskie Serwery Discord | Discordzik.pl">
  <meta name="keywords" content="discordzik, polskie discordy, serwery Discord, najlepsze serwery Discord, społeczności Discord, serwery tematyczne Discord, boty Discord, polska społeczność Discord, serwery gamingowe, promuj serwer Discord, fortnite discord Polska, alternatywa dla disboard, jak promować serwer Discord, gry na Discordzie, discord Among Us Polska, discord randki, serwery Discord Ark, polski Discord, serwery Discord 2025, dodaj serwer Discord">
  <meta name="description" content="Znajdź i dołącz do najlepszych polskich serwerów Discord na Discordzik.pl! Zareklamuj swój serwer i zyskaj aktywnych użytkowników!">
  <meta name="theme-color" content="#5024f3">

  <meta property="og:site_name" content="Discordzik.pl">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://discordzik.pl/ref/${referralCode}">
  <meta property="og:title" content="Znajdź Najlepsze Polskie Serwery Discord | Discordzik">
  <meta property="og:description" content="Znajdź i dołącz do najlepszych polskich serwerów Discord na Discordzik.pl! Zareklamuj swój serwer i zyskaj aktywnych użytkowników!">
  <meta property="og:image" content="/assets/img/banner.png">
  <meta property="og:image:secure_url" content="/assets/img/banner.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/png">

  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="https://discordzik.pl/ref/${referralCode}">
  <meta property="twitter:title" content="Znajdź Najlepsze Polskie Serwery Discord | Discordzik">
  <meta property="twitter:description" content="Znajdź i dołącz do najlepszych polskich serwerów Discord na Discordzik.pl! Zareklamuj swój serwer i zyskaj aktywnych użytkowników!">
  <meta property="twitter:image" content="/assets/img/banner.png">
  <meta property="twitter:image:width" content="1200">
  <meta property="twitter:image:height" content="630">

  <meta http-equiv="refresh" content="1;url=/?ref=${referralCode}">
</head>
<body>
  <div class="container">
    <p>Przekierowywanie...</p>
  </div>
</body>
</html>`);
});

app.get('/ref/apply/:code', referralLimiter, async (req, res) => {
    if (!req.user) {
        return res.redirect(`/login?ref=${encodeURIComponent(req.params.code)}`);
    }

    try {
        const referralCode = req.params.code.toUpperCase();

        if (!/^[A-Z0-9]{4,6}$/.test(referralCode)) {
            return res.redirect('/?error=Nieprawidłowy+kod+referencyjny');
        }

        let userProfile = await UserProfile.findOne({ userID: req.user.id }) 
            ?? await UserProfile.create({ userID: req.user.id });

        if (userProfile.hasUsedReferral) {
            return res.redirect('/?error=Już+użyłeś+reflinka');
        }

        if (userProfile.referralCode === referralCode) {
            return res.redirect('/?error=Nie+możesz+użyć+własnego+kodu');
        }

        const referrer = await UserProfile.findOne({ referralCode });
        if (!referrer) {
            return res.redirect('/?error=Nieprawidłowy+kod+referencyjny');
        }

        await UserProfile.updateOne(
            { userID: req.user.id },
            {
                $set: {
                    referredBy: referralCode,
                    hasUsedReferral: true
                }
            }
        );

        res.redirect('/?success=Kod+referencyjny+zastosowany');
    } catch (err) {
        console.error('Błąd reflinka:', err);
        res.redirect('/?error=Błąd+systemu');
    }
});


module.exports = app;