const { app } = require('./middleware.js');
const gmusicRouter = require('./gmusicmb.js'); // 1. Importamos el router de GMusic

const PORT = process.env.PORT || 3000;

// 2. Le decimos a la app que use el router de GMusic para todas las peticiones a /api/search
app.use('/api/search', gmusicRouter);

app.listen(PORT, () => {
    // Este log es más genérico para entornos de despliegue
    console.log(`Server listening on port ${PORT}`);
});
