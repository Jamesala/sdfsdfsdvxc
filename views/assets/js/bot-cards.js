(async function() {
    // Funkcja do losowego mieszania tablicy
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Funkcja do określania klasy CSS na podstawie statusu
    function getStatusClass(status) {
        switch(status) {
            case 'PRO': return 'pro-badge';
            case 'GOLD': return 'gold-badge';
            case 'BASIC': return 'basic-badge';
            default: return '';
        }
    }

    // Pobierz promowane serwery z API
    async function fetchPromotedServers() {
        try {
            const response = await fetch('/api/promoted-servers');
            
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching promoted servers:', error);
            return [];
        }
    }

    // Przygotuj karty serwerów
    async function prepareServerCards() {
        const servers = await fetchPromotedServers();
        
        return servers.map(server => {
            // Nazwa serwera z API lub fallback
            const serverName = server.name || "Nieznany";

            // Logowanie dla debugowania
            if (serverName === "Nieznany") {
                console.warn(`Frontend: Server ${server.serverID} has no name. API response:`, JSON.stringify(server, null, 2));
            }

            // Ikona serwera z API lub fallback
            let iconURL = server.iconURL || 'https://cdn.discordapp.com/embed/avatars/0.png';
            // Jeśli API zwraca serverID i icon, generuj URL w formacie Discord
            if (server.serverID && server.icon) {
                iconURL = `https://cdn.discordapp.com/icons/${server.serverID}/${server.icon}.webp?size=256`;
            }

            return {
                serverID: server.serverID,
                name: serverName,
                shortDesc: server.shortDesc || "Join our awesome community!",
                iconURL: iconURL,
                tags: server.tags || ["Community"],
                status: server.status,
                serverLink: `/server/${server.serverID}`,
                memberCount: server.memberCount || 'X=Unknown'
            };
        });
    }

    // Renderuj karty w karuzeli
    async function renderCards() {
        const botCardsWrapper = document.getElementById('bot-cards-wrapper');
        if (!botCardsWrapper) return;
        
        botCardsWrapper.innerHTML = '<div class="loading-spinner"></div>';
        
        try {
            const serverCards = await prepareServerCards();
            
            if (serverCards.length === 0) {
                botCardsWrapper.innerHTML = '<div class="no-servers">No promoted servers at the moment. Check back later!</div>';
                return;
            }
            
            botCardsWrapper.innerHTML = '';
            
            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'bot-cards-slider';
            
            const shuffledCards = shuffleArray([...serverCards]);
            
            shuffledCards.forEach(card => {
                const cardElement = document.createElement('div');
                cardElement.className = 'bot-card-slide';
                cardElement.innerHTML = `
                    <a href="${card.serverLink}" style="text-decoration: none; color: inherit;">
                        <div class="bot-card">
                            <div class="bot-card-content">
                                <div style="position: relative;">
                                    <img src="${card.iconURL}" 
                                         class="rounded-circle mb-2 ${card.status === 'PRO' ? 'pro-border' : card.status === 'GOLD' ? 'gold-border' : card.status === 'BASIC' ? 'basic-border' : ''}" 
                                         alt="Ikona serwera Discord ${card.name}"
                                         onerror="this.onerror=null;this.src='https://cdn.discordapp.com/embed/avatars/0.png'"
                                         style="width: 90px; height: 90px; object-fit: cover; border: 3px solid ${card.status === 'PRO' ? '#ff9a3e' : card.status === 'GOLD' ? '#ffd700' : card.status === 'BASIC' ? '#3a86ff' : '#6c757d'};">
                                    <div class="member-count-badge" style="position: absolute; top: 0px; right: 0px; z-index: 2;">
                                        <i class="bx bx-server"></i>
                                        <span>${card.memberCount.toLocaleString() || 'X=Brak danych'}</span>
                                    </div>
                                </div>
                                <div class="bot-card-text-content">
                                    <h6>${card.name}</h6>
                                    <p class="bot-card-description">${card.shortDesc}</p>
                                    <div class="tag-container">
                                        ${card.tags.slice(0, 3).map(tag => `<span class="badge" style="margin: 2px; font-size: 10px;">${tag}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </a>
                `;
                sliderContainer.appendChild(cardElement);
            });
            
            botCardsWrapper.appendChild(sliderContainer);
            
            if (window.jQuery && jQuery.fn.slick) {
                initCarousel();
            } else {
                const checkInterval = setInterval(() => {
                    if (window.jQuery && jQuery.fn.slick) {
                        clearInterval(checkInterval);
                        initCarousel();
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error rendering server cards:', error);
            botCardsWrapper.innerHTML = '<div class="error-message">Failed to load promoted servers. Please try again later.</div>';
        }
    }

    // Inicjalizuj karuzelę
    function initCarousel() {
        if (jQuery('.bot-cards-slider').hasClass('slick-initialized')) {
            jQuery('.bot-cards-slider').slick('unslick');
        }
        
        jQuery('.bot-cards-slider').slick({
            dots: true,
            infinite: true,
            speed: 300,
            slidesToShow: 4,
            slidesToScroll: 1,
            autoplay: true,
            autoplaySpeed: 5000,
            arrows: true,
            responsive: [
                {
                    breakpoint: 1200,
                    settings: {
                        slidesToShow: 3,
                        slidesToScroll: 1
                    }
                },
                {
                    breakpoint: 992,
                    settings: {
                        slidesToShow: 2,
                        slidesToScroll: 1
                    }
                },
                {
                    breakpoint: 576,
                    settings: {
                        slidesToShow: 1,
                        slidesToScroll: 1
                    }
                }
            ]
        });
    }

    // Uruchom po załadowaniu DOM
    document.addEventListener('DOMContentLoaded', function() {
        if (window.jQuery) {
            renderCards();
        } else {
            const waitForJQuery = setInterval(function() {
                if (window.jQuery) {
                    clearInterval(waitForJQuery);
                    renderCards();
                }
            }, 100);
        }
    });
})();