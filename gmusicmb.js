const express = require('express');
const path = require('path');
const ytSearch = require('yt-search');

const router = express.Router();

// Servir la interfaz web del Launcher directamente
const assetsPath = path.join(__dirname, 'app', 'src', 'main', 'assets');
router.use(express.static(assetsPath));

// Función para procesar la búsqueda con yt-search
const handleSearch = async (query, res) => {
    try {
        if (!query || query.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'El parametro "query" o "q" es requerido.' 
            });
        }

        console.log(`🔍 Buscando en YouTube: "${query}"`);
        const results = await ytSearch(query);
        
        const videos = results.videos.slice(0, 15).map(v => ({
            videoId: v.videoId,
            title: v.title,
            url: v.url,
            thumbnail: v.thumbnail,
            duration: v.timestamp,
            views: v.views,
            author: v.author.name
        }));

        res.json(videos);

    } catch (error) {
        console.error('❌ Error en la busqueda:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Error al procesar la busqueda en YouTube.',
            error: error.message 
        });
    }
};

// Soporta peticiones GET (/search/api?q=cancion) y POST
router.get('/api', (req, res) => {
    const query = req.query.q || req.query.query;
    handleSearch(query, res);
});

router.post('/api', (req, res) => {
    const { query } = req.body;
    handleSearch(query, res);
});

// Ruta por defecto para enviar index.html
router.get('/', (req, res) => {
    res.sendFile(path.join(assetsPath, 'index.html'));
});

// Exportamos el router para integrarlo en el servidor principal
module.exports = router;
