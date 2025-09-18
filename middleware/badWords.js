const BAD_WORDS = [
  'kurwa', 'chuj', 'pierdol', 'jebać', 'jebac', 'pierdole', 'pizda',
  'huj', 'cipa', 'sukinsyn', 'skurwysyn', 'debil', 'idiota',
  // dodaj więcej słów według potrzeb
];

// Funkcja pomocnicza do wykrywania przekleństw
function containsBadWords(text) {
  if (!text || typeof text !== 'string') return false;
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some(word => lowerText.includes(word));
}

// Middleware z blokowaniem logów
const badWordsMiddleware = (req, res, next) => {
  // Flaga informująca czy wykryto przekleństwa
  req.containsBadWords = false;
  
  const checkFields = {
    body: req.body,
    query: req.query,
    params: req.params
  };

  const checkForBadWords = (obj) => {
    if (!obj) return false;
    
    for (const key in obj) {
      const value = obj[key];
      
      if (typeof value === 'string' && containsBadWords(value)) {
        return true;
      }
      
      if (typeof value === 'object' && checkForBadWords(value)) {
        return true;
      }
    }
    
    return false;
  };

  // Sprawdzanie wszystkich pól
  for (const field in checkFields) {
    if (checkForBadWords(checkFields[field])) {
      req.containsBadWords = true;
      return res.status(400).json({ 
        success: false, 
        error: 'Zawartość zawiera niedozwolone słowa' 
      });
    }
  }

  next();
};

// Funkcja do sprawdzania czy można wysłać log
const canSendLog = (req) => {
  return !req.containsBadWords;
};

module.exports = {
  badWordsMiddleware,
  containsBadWords,
  canSendLog
};