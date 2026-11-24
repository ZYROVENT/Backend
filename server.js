const { app } = require('./middleware.js');
const gmusicRoutes = require('./gmusicmb.js'); // Búsqueda antigua (web)
const musicRoutes = require('./music.js'); // GMusic para el launcher

const PORT = process.env.PORT || 3000;

// Búsqueda de la web: /search/api?q=cancion
app.use('/search', gmusicRoutes);

// Música del launcher: búsqueda, resolución y streaming.
app.use('/api/music', musicRoutes);

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`🎵 API GMusic disponible en: /search/api`);
    console.log(`🎧 GMusic launcher disponible en: /api/music/search?q=...`);
});
