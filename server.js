const { app } = require('./middleware.js');
const gmusicRoutes = require('./gmusicmb.js'); // Importas tu archivo

const PORT = process.env.PORT || 3000;

// Montamos las rutas de gmusicmb bajo el prefijo /search
app.use('/search', gmusicRoutes);

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`🎵 API GMusic disponible en: /search/api`);
});
