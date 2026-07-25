const express = require('express');
const cors = require('cors');
const path = require('path');
const ytSearch = require('yt-search');

const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Servir la interfaz web del Launcher directamente (index.html, css, js, icons, etc.)
const assetsPath = path.join(__dirname, 'app', 'src', 'main', 'assets');
app.use(express.static(assetsPath));

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

        res.json(videos); // Devuelve directamente el array de videos para compatibilidad directa con el launcher

    } catch (error) {
        console.error('❌ Error en la busqueda:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Error al procesar la busqueda en YouTube.',
            error: error.message 
        });
    }
};

// Soporta peticiones GET (/api/search?q=cancion) y POST ({ query: "cancion" })
app.get('/api/search', (req, res) => {
    const query = req.query.q || req.query.query;
    handleSearch(query, res);
});

app.post('/api/search', (req, res) => {
    const { query } = req.body;
    handleSearch(query, res);
});

// Ruta por defecto para enviar index.html si accedes desde navegador
app.get('/', (req, res) => {
    res.sendFile(path.join(assetsPath, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const localIp = Object.values(networkInterfaces).flat().find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';

    console.log(`\n==============================================`);
    console.log(`🚀 Live-Server & API de GLauncher en ejecucion`);
    console.log(`🌐 Interfaz Web: http://localhost:${PORT}`);
    console.log(`📱 URL Red Local: http://${localIp}:${PORT}`);
    console.log(`🎵 API GMusic Search: http://${localIp}:${PORT}/api/search`);
    console.log(`==============================================\n`);
});
