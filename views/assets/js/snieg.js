/* Ustawienia globalne */
html, body {
  height: 100%;
  margin: 0;
  overflow: hidden; /* Ukrywa nadmiar płatków, które wychodzą poza ekran */
  background: none; /* Brak tła */
  position: relative; /* Ustawienie pozycji dla płatków śniegu */
}

/* Styl dla pojedynczego płatka śniegu */
.snowflake {
  position: absolute;
  top: -10px; /* Płatki zaczynają spadać poza ekranem */
  width: 10px;
  height: 10px;
  background-color: #fff; /* Kolor płatków */
  border-radius: 50%; /* Płatki w kształcie okręgu */
  opacity: 0.8;
  pointer-events: none; /* Płatki nie będą interagować z użytkownikiem */
  animation: fall linear infinite, sway ease-in-out infinite;
}

/* Animacja opadania płatków */
@keyframes fall {
  0% {
    transform: translateY(-10px) translateX(0); /* Początkowa pozycja płatka */
  }
  100% {
    transform: translateY(100vh) translateX(20px); /* Płatki opadają na dole ekranu */
  }
}

/* Animacja kołysania płatków w poziomie */
@keyframes sway {
  0%, 100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(15px);
  }
}

/* Opcjonalne różne rozmiary płatków */
.snowflake:nth-child(1) {
  width: 8px;
  height: 8px;
}

.snowflake:nth-child(2) {
  width: 12px;
  height: 12px;
}

.snowflake:nth-child(3) {
  width: 14px;
  height: 14px;
}

.snowflake:nth-child(4) {
  width: 10px;
  height: 10px;
}
