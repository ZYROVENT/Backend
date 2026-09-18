require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const Pusher = require('pusher');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_dev';
const SALT_ROUNDS = 10;

// --- Conexión a Supabase ---
const supabaseUrl = process.env.SUPABASE_URL || 'https://ouqpeojilykkrmatijxp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXBlb2ppbHlra3JtYXRpanhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5OTc3NjgsImV4cCI6MjA4NTU3Mzc2OH0.cI5AV0N-F1B2tqvBUKgOz0T2XCF3i56K23spLb3sHHY';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Configuración de Pusher (Real-time notifications & chat) ---
let pusher = null;
try {
    pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID || "1800000",
        key: process.env.PUSHER_KEY || "a2fb8d4323a44da53c63",
        secret: process.env.PUSHER_SECRET || "dummy_secret",
        cluster: process.env.PUSHER_CLUSTER || "us2",
        useTLS: true
    });
} catch (e) {
    console.warn('Pusher initialization warning:', e.message);
}

// Multer storage in memory for avatars
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// In-memory fallback caches
const mockData = {
    news: [
        { id: 1, title: 'Bienvenido a GLauncher', content: '¡El cliente web y launcher oficial ya están disponibles!', date: '2026-03-01' },
        { id: 2, title: 'Actualización v2.0', content: 'Mejoras en rendimiento, chat en tiempo real y personalización.', date: '2026-03-10' }
    ],
    chatHistory: {}
};

/**
 * Middleware para verificar autenticación JWT.
 */
const loginRequired = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ error: 'Token inválido o expirado.' });
        }
        req.user = user;
        next();
    });
};

/**
 * Middleware para verificar rol de Administrador.
 */
const adminRequired = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Acceso denegado. Usuario no autenticado.' });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('is_admin, role')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        if (user.is_admin || user.role === 'admin' || user.role === 'SuperAdmin') {
            return next();
        }

        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    } catch (err) {
        return res.status(500).json({ error: 'Error al verificar permisos de administrador.' });
    }
};

const publicEndpoint = (req, res, next) => {
    next();
};

// --- Plantillas HTML para OAuth y Cargas ---
const getNeonLoaderHtml = (provider, targetUrl) => `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conectando con ${provider}...</title>
    <style>
        body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #050505; font-family: 'Segoe UI', sans-serif; overflow: hidden; }
        .loader-container { position: relative; display: flex; flex-direction: column; align-items: center; }
        .loader { position: relative; width: 150px; height: 150px; border-radius: 50%; background: linear-gradient(45deg, transparent, transparent 40%, #00ff0a); animation: animate 2s linear infinite; }
        .loader::before { content: ''; position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px; background: #050505; border-radius: 50%; z-index: 1000; }
        .loader::after { content: ''; position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; background: linear-gradient(45deg, transparent, transparent 40%, #00ff0a); border-radius: 50%; z-index: 1; filter: blur(30px); }
        @keyframes animate { 0% { transform: rotate(0deg); filter: hue-rotate(0deg); } 100% { transform: rotate(360deg); filter: hue-rotate(360deg); } }
        h2 { color: #fff; margin-top: 20px; letter-spacing: 2px; text-transform: uppercase; font-size: 1.2rem; z-index: 1001; text-shadow: 0 0 10px #00ff0a; }
    </style>
</head>
<body>
    <div class="loader-container">
        <div class="loader"></div>
        <h2>Redirigiendo a ${provider}</h2>
    </div>
    <script>
        setTimeout(() => { window.location.href = '${targetUrl}'; }, 2000);
    </script>
</body>
</html>
`;

const getSuccessHtml = (token, targetUrl) => `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Autenticación Exitosa</title>
    <style>
        body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #050505; font-family: 'Segoe UI', sans-serif; overflow: hidden; }
        .loader-container { position: relative; display: flex; flex-direction: column; align-items: center; }
        .loader { position: relative; width: 150px; height: 150px; border-radius: 50%; background: linear-gradient(45deg, transparent, transparent 40%, #00ff0a); animation: animate 2s linear infinite; }
        .loader::before { content: ''; position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px; background: #050505; border-radius: 50%; z-index: 1000; }
        .loader::after { content: ''; position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; background: linear-gradient(45deg, transparent, transparent 40%, #00ff0a); border-radius: 50%; z-index: 1; filter: blur(30px); }
        @keyframes animate { 0% { transform: rotate(0deg); filter: hue-rotate(0deg); } 100% { transform: rotate(360deg); filter: hue-rotate(360deg); } }
        h2 { color: #fff; margin-top: 20px; letter-spacing: 2px; text-transform: uppercase; font-size: 1.2rem; z-index: 1001; text-shadow: 0 0 10px #00ff0a; }
        p { color: #aaa; margin-top: 10px; font-size: 0.9rem; z-index: 1001; }
    </style>
</head>
<body>
    <div class="loader-container">
        <div class="loader"></div>
        <h2>¡Autenticación Exitosa!</h2>
        <p>Redirigiendo a GLauncher...</p>
    </div>
    <script>
        localStorage.setItem('glauncher_token', '${token}');
        setTimeout(() => { window.location.href = '${targetUrl}?token=${token}'; }, 1500);
    </script>
</body>
</html>
`;

// ==========================================
// --- RUTAS PÚBLICAS Y DE AUTENTICACIÓN ---
// ==========================================

app.get('/', (req, res) => res.json({ message: 'GLauncher API Online', version: '2.0.0' }));
app.get('/api/news', (req, res) => res.json(mockData.news));

// Verificación de disponibilidad de username
app.post('/api/auth/check-username', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ available: false, message: 'Nombre de usuario no proporcionado.' });
    }

    if (username.length > 16 || /\s/.test(username)) {
        return res.status(400).json({ available: false, message: 'Formato de usuario no válido.' });
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('Error al verificar username en Supabase:', error);
            return res.json({ available: true });
        }

        return res.json({ available: !data });
    } catch (error) {
        console.error('Error al verificar el nombre de usuario:', error);
        res.status(500).json({ available: false, message: 'Error interno del servidor.' });
    }
});

// Registro de usuarios
app.post('/api/auth/register', async (req, res) => {
    const { username, password, security_code } = req.body;

    if (!username || !password || !security_code) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    if (username.length > 16 || /\s/.test(username)) {
        return res.status(400).json({ message: 'El nombre de usuario debe tener máximo 16 caracteres y sin espacios.' });
    }
    if (String(security_code).length !== 6) {
        return res.status(400).json({ message: 'El código de seguridad debe tener 6 dígitos.' });
    }

    try {
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        const { data, error } = await supabase
            .from('users')
            .insert([{
                username,
                password_hash,
                security_code: String(security_code),
                account_type: 'standard',
                nickname: username,
                role: 'Jugador',
                gcoins: 100,
                status: 'Disponible',
                play_time_seconds: 0,
                show_online: true,
                allow_requests: true,
                register_complete: 'yes'
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ message: 'El nombre de usuario ya está en uso.' });
            }
            throw error;
        }

        const token = jwt.sign({ id: data.id, username: data.username, role: data.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'Usuario registrado con éxito.', userId: data.id, token });

    } catch (error) {
        console.error('Error en el registro:', error);
        res.status(500).json({ message: 'Error interno al procesar el registro.' });
    }
});

// Verificación de credenciales (Paso 1 del Login)
app.post('/api/auth/check_credentials', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Usuario y contraseña son requeridos.' });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, password_hash')
            .eq('username', username)
            .maybeSingle();

        if (error || !user) {
            return res.status(401).json({ message: 'El usuario no existe o las credenciales son incorrectas.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Contraseña incorrecta.' });
        }

        res.json({ message: 'Credenciales válidas.', success: true });
    } catch (err) {
        console.error('Error en check_credentials:', err);
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});

// Inicio de sesión (Paso 2 con código de seguridad)
app.post('/api/auth/login', async (req, res) => {
    const { username, password, security_code } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Usuario y contraseña requeridos.' });
    }

    try {
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (userError || !user) {
            return res.status(401).json({ message: 'Credenciales incorrectas.' });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: 'Credenciales incorrectas.' });
        }

        if (security_code && String(user.security_code) !== String(security_code)) {
            return res.status(401).json({ message: 'El código de seguridad es incorrecto.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, is_admin: user.is_admin }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.json({ 
            token, 
            user: {
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                role: user.role,
                avatar_url: user.avatar_url || user.profile_picture_url
            }
        });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});

// OAuth Google / Microsoft simulados/reales
app.get('/login/google', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/auth/google/callback`;
    res.send(getNeonLoaderHtml('Google', redirectUri));
});

app.get('/auth/google/callback', async (req, res) => {
    try {
        const demoEmail = `gamer_${Math.floor(1000 + Math.random() * 9000)}`;
        let { data: user } = await supabase.from('users').select('*').eq('username', demoEmail).maybeSingle();

        if (!user) {
            const { data: newUser } = await supabase.from('users').insert({
                username: demoEmail,
                nickname: demoEmail,
                account_type: 'google',
                register_complete: 'yes',
                role: 'Jugador',
                gcoins: 100,
                status: 'Disponible'
            }).select().single();
            user = newUser || { id: Date.now(), username: demoEmail, role: 'Jugador' };
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.send(getSuccessHtml(token, '/src/html/dashboard.html'));
    } catch (error) {
        res.status(500).send('<h1>Error de autenticación Google</h1>');
    }
});

app.get('/login/microsoft', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/auth/microsoft/callback`;
    res.send(getNeonLoaderHtml('Microsoft', redirectUri));
});

app.get('/auth/microsoft/callback', async (req, res) => {
    try {
        const demoEmail = `msft_${Math.floor(1000 + Math.random() * 9000)}`;
        let { data: user } = await supabase.from('users').select('*').eq('username', demoEmail).maybeSingle();

        if (!user) {
            const { data: newUser } = await supabase.from('users').insert({
                username: demoEmail,
                nickname: demoEmail,
                account_type: 'microsoft',
                register_complete: 'yes',
                role: 'Jugador',
                gcoins: 100,
                status: 'Disponible'
            }).select().single();
            user = newUser || { id: Date.now(), username: demoEmail, role: 'Jugador' };
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.send(getSuccessHtml(token, '/src/html/dashboard.html'));
    } catch (error) {
        res.status(500).send('<h1>Error de autenticación Microsoft</h1>');
    }
});

// ==========================================
// --- RUTAS DE USUARIO Y DASHBOARD ---
// ==========================================

// Obtener datos del perfil de usuario
app.get('/api/user_info', loginRequired, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, nickname, gcoins, play_time_seconds, created_at, account_type, profile_picture_url, avatar_url, role, is_admin, register_complete, status, show_online, allow_requests')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Formato unificado de avatar
        user.avatar_url = user.avatar_url || user.profile_picture_url || `https://crafatar.com/avatars/${user.username}?size=100&overlay`;
        user.status = user.status || 'Disponible';
        user.owned_cosmetics = user.owned_cosmetics || [];

        res.json(user);
    } catch (err) {
        console.error('Error al obtener user_info:', err);
        res.status(500).json({ message: 'Error al obtener datos de usuario.' });
    }
});

// Buscar usuarios en la base de datos (Real-time search)
app.get('/api/users/search', loginRequired, async (req, res) => {
    const query = req.query.q || req.query.query || '';
    if (!query || query.trim().length === 0) {
        return res.json([]);
    }

    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, nickname, profile_picture_url, avatar_url, role, status')
            .ilike('username', `%${query.trim()}%`)
            .neq('id', req.user.id)
            .limit(20);

        if (error) {
            console.error('Error en búsqueda de usuarios:', error);
            return res.json([]);
        }

        const formattedUsers = (users || []).map(u => ({
            id: u.id,
            username: u.username,
            nickname: u.nickname || u.username,
            avatar_url: u.avatar_url || u.profile_picture_url || `https://crafatar.com/avatars/${u.username}?size=100&overlay`,
            role: u.role || 'Jugador',
            status: u.status || 'Disponible'
        }));

        res.json(formattedUsers);
    } catch (err) {
        console.error('Error en /api/users/search:', err);
        res.status(500).json({ message: 'Error interno en la búsqueda.' });
    }
});

// Actualizar estado del usuario (Disponible, Ausente, Jugando)
app.post('/api/user/status', loginRequired, async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['Disponible', 'Ausente', 'Jugando'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Estado no válido.' });
    }

    try {
        await supabase
            .from('users')
            .update({ status })
            .eq('id', req.user.id);

        if (pusher) {
            pusher.trigger('user-status-channel', 'status-update', {
                userId: req.user.id,
                username: req.user.username,
                status
            }).catch(e => console.warn('Pusher status trigger failed:', e.message));
        }

        res.json({ success: true, status });
    } catch (err) {
        console.error('Error al actualizar status:', err);
        res.status(500).json({ message: 'Error al actualizar estado.' });
    }
});

// Actualizar perfil (Username y Avatar)
app.post('/api/user/update_profile', loginRequired, upload.single('avatar_file'), async (req, res) => {
    const { username, avatar_url } = req.body;
    const updateData = {};

    if (username) {
        if (username.length > 16 || /\s/.test(username)) {
            return res.status(400).json({ message: 'El nombre de usuario no puede tener más de 16 caracteres ni espacios.' });
        }
        updateData.username = username;
        updateData.nickname = username;
    }

    if (avatar_url) {
        updateData.avatar_url = avatar_url;
        updateData.profile_picture_url = avatar_url;
    }

    // Si se subió archivo con Multer
    if (req.file) {
        // En una implementación con Supabase Storage se subiría aquí; guardamos data URI o ruta
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        updateData.avatar_url = base64Image;
        updateData.profile_picture_url = base64Image;
    }

    try {
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ message: 'Ese nombre de usuario ya está en uso.' });
            }
            throw error;
        }

        // Si cambió el username, generar nuevo JWT
        let newToken = null;
        if (username && username !== req.user.username) {
            newToken = jwt.sign({ id: req.user.id, username, role: updatedUser.role }, JWT_SECRET, { expiresIn: '7d' });
        }

        res.json({
            message: 'Perfil actualizado con éxito.',
            user: updatedUser,
            token: newToken
        });
    } catch (err) {
        console.error('Error al actualizar perfil:', err);
        res.status(500).json({ message: 'Error al actualizar el perfil.' });
    }
});

// Actualizar contraseña
app.post('/api/user/update_password', loginRequired, async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return res.status(400).json({ message: 'Se requiere la contraseña actual y la nueva contraseña.' });
    }

    if (new_password.length < 6) {
        return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('password_hash')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });
        }

        const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
        await supabase
            .from('users')
            .update({ password_hash: newHash })
            .eq('id', req.user.id);

        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (err) {
        console.error('Error al actualizar contraseña:', err);
        res.status(500).json({ message: 'Error al actualizar la contraseña.' });
    }
});

// Actualizar configuración de privacidad
app.post('/api/user/privacy', loginRequired, async (req, res) => {
    const { show_online, allow_requests } = req.body;
    const updateData = {};

    if (typeof show_online === 'boolean') updateData.show_online = show_online;
    if (typeof allow_requests === 'boolean') updateData.allow_requests = allow_requests;

    try {
        await supabase
            .from('users')
            .update(updateData)
            .eq('id', req.user.id);

        res.json({ message: 'Ajustes de privacidad guardados.', privacy: updateData });
    } catch (err) {
        console.error('Error al guardar privacidad:', err);
        res.status(500).json({ message: 'Error al guardar ajustes de privacidad.' });
    }
});

// Eliminar cuenta
app.post('/api/user/delete_account', loginRequired, async (req, res) => {
    const { password, security_code } = req.body;

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('password_hash, security_code')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        if (password) {
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ message: 'Contraseña incorrecta.' });
            }
        }

        if (security_code && String(user.security_code) !== String(security_code)) {
            return res.status(401).json({ message: 'Código de seguridad incorrecto.' });
        }

        // Eliminar relaciones de amistad
        await supabase.from('friendships').delete().or(`user_id_1.eq.${req.user.id},user_id_2.eq.${req.user.id}`);
        // Eliminar usuario
        await supabase.from('users').delete().eq('id', req.user.id);

        res.json({ message: 'Cuenta eliminada exitosamente.' });
    } catch (err) {
        console.error('Error al eliminar cuenta:', err);
        res.status(500).json({ message: 'Error interno al eliminar la cuenta.' });
    }
});

// ==========================================
// --- RUTAS DE AMIGOS Y SOCIAL ---
// ==========================================

// Obtener amigos y solicitudes
app.get('/api/friends', loginRequired, async (req, res) => {
    const userId = req.user.id;

    try {
        // Intento 1: Traer con relaciones si PostgREST detectó las FKs
        let friendships = null;
        let queryError = null;

        const resWithRel = await supabase
            .from('friendships')
            .select(`
                id,
                status,
                user_id_1,
                user_id_2,
                user1:users!user_id_1(id, username, nickname, avatar_url, profile_picture_url, status, role),
                user2:users!user_id_2(id, username, nickname, avatar_url, profile_picture_url, status, role)
            `)
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

        if (!resWithRel.error && resWithRel.data) {
            friendships = resWithRel.data;
        } else {
            // Intento 2: Fallback plano (sin join forzado de PostgREST)
            const resPlain = await supabase
                .from('friendships')
                .select('id, status, user_id_1, user_id_2')
                .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

            if (resPlain.error) {
                console.warn('Advertencia al consultar amistades:', resPlain.error.message);
                return res.json({ friends: [], pending: [], sent: [] });
            }

            const rawFriendships = resPlain.data || [];
            if (rawFriendships.length === 0) {
                return res.json({ friends: [], pending: [], sent: [] });
            }

            // Extraer IDs únicos de los otros usuarios
            const otherIds = [...new Set(rawFriendships.map(f => String(f.user_id_1) === String(userId) ? f.user_id_2 : f.user_id_1))];
            const { data: usersData } = await supabase
                .from('users')
                .select('id, username, nickname, avatar_url, profile_picture_url, status, role')
                .in('id', otherIds);

            const userMap = {};
            (usersData || []).forEach(u => { userMap[String(u.id)] = u; });

            friendships = rawFriendships.map(f => ({
                ...f,
                user1: String(f.user_id_1) === String(userId) ? null : userMap[String(f.user_id_1)],
                user2: String(f.user_id_2) === String(userId) ? null : userMap[String(f.user_id_2)]
            }));
        }

        const friends = [];
        const pending = [];
        const sent = [];

        (friendships || []).forEach(f => {
            const isUser1 = String(f.user_id_1) === String(userId);
            const otherUser = isUser1 ? f.user2 : f.user1;

            if (!otherUser) return;
            otherUser.avatar_url = otherUser.avatar_url || otherUser.profile_picture_url || `https://crafatar.com/avatars/${otherUser.username}?size=100&overlay`;

            if (f.status === 'accepted') {
                friends.push(otherUser);
            } else if (f.status === 'pending') {
                if (isUser1) {
                    sent.push(otherUser);
                } else {
                    pending.push(otherUser);
                }
            }
        });

        res.json({ friends, pending, sent });
    } catch (err) {
        console.error('Error en /api/friends:', err);
        res.json({ friends: [], pending: [], sent: [] });
    }
});

// Enviar solicitud de amistad
app.post('/api/friends/add', loginRequired, async (req, res) => {
    const { username, friend_id } = req.body;
    const userId = req.user.id;

    try {
        let targetUser = null;
        if (friend_id) {
            const { data } = await supabase.from('users').select('id, username').eq('id', friend_id).single();
            targetUser = data;
        } else if (username) {
            const { data } = await supabase.from('users').select('id, username').eq('username', username).single();
            targetUser = data;
        }

        if (!targetUser) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        if (String(targetUser.id) === String(userId)) {
            return res.status(400).json({ message: 'No puedes agregarte a ti mismo como amigo.' });
        }

        // Comprobar si ya existe alguna relación en cualquier dirección
        const { data: existing } = await supabase
            .from('friendships')
            .select('id, status, user_id_1, user_id_2')
            .or(`and(user_id_1.eq.${userId},user_id_2.eq.${targetUser.id}),and(user_id_1.eq.${targetUser.id},user_id_2.eq.${userId})`)
            .maybeSingle();

        if (existing) {
            if (existing.status === 'accepted') {
                return res.status(400).json({ message: `${targetUser.username} ya es tu amigo.` });
            }
            if (String(existing.user_id_1) === String(userId)) {
                return res.status(400).json({ message: 'Ya has enviado una solicitud a este usuario.' });
            } else {
                // Si la otra persona ya me había enviado solicitud, la aceptamos automáticamente
                await supabase
                    .from('friendships')
                    .update({ status: 'accepted' })
                    .eq('id', existing.id);

                if (pusher) {
                    const payload = { by: { id: userId, username: req.user.username } };
                    pusher.trigger(`user-${targetUser.id}`, 'friend-accepted', payload).catch(() => {});
                    pusher.trigger('global-friends-channel', 'friend-updated', {}).catch(() => {});
                }
                return res.json({ message: `¡Solicitud mutua aceptada! Ahora eres amigo de ${targetUser.username}.` });
            }
        }

        // Insertar relación de amistad pendiente
        const { data, error } = await supabase
            .from('friendships')
            .insert([{
                user_id_1: userId,
                user_id_2: targetUser.id,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) {
            return res.status(400).json({ message: 'Error al registrar la solicitud de amistad.' });
        }

        // Notificar en tiempo real con Pusher (por ID y por username)
        if (pusher) {
            const payload = { from: { id: userId, username: req.user.username }, targetUsername: targetUser.username };
            pusher.trigger(`user-${targetUser.id}`, 'friend-request', payload).catch(e => console.warn('Pusher ID notify failed:', e.message));
            pusher.trigger(`user-${targetUser.username}`, 'friend-request', payload).catch(e => console.warn('Pusher username notify failed:', e.message));
            pusher.trigger('global-friends-channel', 'friend-updated', {}).catch(() => {});
        }

        res.json({ message: `Solicitud de amistad enviada a ${targetUser.username}.`, friendship: data });
    } catch (err) {
        console.error('Error al enviar solicitud de amistad:', err);
        res.status(500).json({ message: 'Error al enviar solicitud.' });
    }
});

// Aceptar solicitud de amistad
app.post('/api/friends/accept', loginRequired, async (req, res) => {
    const { friend_id } = req.body;
    const userId = req.user.id;

    try {
        const { data, error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('user_id_1', friend_id)
            .eq('user_id_2', userId)
            .select()
            .single();

        if (error || !data) {
            return res.status(404).json({ message: 'Solicitud no encontrada.' });
        }

        if (pusher) {
            const payload = { by: { id: userId, username: req.user.username } };
            pusher.trigger(`user-${friend_id}`, 'friend-accepted', payload).catch(e => console.warn('Pusher accept failed:', e.message));
            pusher.trigger('global-friends-channel', 'friend-updated', {}).catch(() => {});
        }

        res.json({ message: 'Solicitud de amistad aceptada.' });
    } catch (err) {
        console.error('Error al aceptar amistad:', err);
        res.status(500).json({ message: 'Error al aceptar la solicitud.' });
    }
});

// Eliminar amigo o rechazar solicitud
app.post('/api/friends/remove', loginRequired, async (req, res) => {
    const { friend_id } = req.body;
    const userId = req.user.id;

    try {
        await supabase
            .from('friendships')
            .delete()
            .or(`and(user_id_1.eq.${userId},user_id_2.eq.${friend_id}),and(user_id_1.eq.${friend_id},user_id_2.eq.${userId})`);

        res.json({ message: 'Amigo eliminado correctamente.' });
    } catch (err) {
        console.error('Error al eliminar amigo:', err);
        res.status(500).json({ message: 'Error al procesar la solicitud.' });
    }
});

// ==========================================
// --- RUTAS DE GCHAT (MENSAJERÍA PRIVADA) ---
// ==========================================

// Obtener historial de mensajes con un amigo
app.get('/api/gchat/history/:friendId', loginRequired, async (req, res) => {
    const userId = req.user.id;
    const friendId = req.params.friendId;
    const roomKey = [userId, friendId].sort().join('-');

    try {
        // Consultar historial en Supabase o memoria
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`)
            .order('created_at', { ascending: true })
            .limit(50);

        if (!error && messages) {
            return res.json(messages);
        }

        // Fallback en memoria
        return res.json(mockData.chatHistory[roomKey] || []);
    } catch (err) {
        return res.json(mockData.chatHistory[roomKey] || []);
    }
});

// Enviar mensaje a un amigo
app.post('/api/gchat/send/:recipientId', loginRequired, async (req, res) => {
    const senderId = req.user.id;
    const receiverId = req.params.recipientId;
    const { message } = req.body;

    if (!message || message.trim() === '') {
        return res.status(400).json({ message: 'El mensaje no puede estar vacío.' });
    }

    const newMessage = {
        id: Date.now(),
        sender_id: senderId,
        receiver_id: receiverId,
        sender_username: req.user.username,
        message: message.trim(),
        created_at: new Date().toISOString()
    };

    // Guardar en Supabase si la tabla existe
    try {
        await supabase.from('messages').insert([newMessage]);
    } catch (err) {
        console.warn('Could not persist message to Supabase, keeping in memory:', err.message);
    }

    // Guardar en memoria de respaldo
    const roomKey = [senderId, receiverId].sort().join('-');
    if (!mockData.chatHistory[roomKey]) mockData.chatHistory[roomKey] = [];
    mockData.chatHistory[roomKey].push(newMessage);

    // Emitir con Pusher
    if (pusher) {
        const channelName = `chat-${roomKey}`;
        pusher.trigger(channelName, 'new-message', newMessage)
            .catch(e => console.warn('Pusher chat send failed:', e.message));

        // Notificar también al canal personal del destinatario
        pusher.trigger(`user-${receiverId}`, 'chat-notification', {
            from: req.user.username,
            senderId,
            message: newMessage.message
        }).catch(e => console.warn('Pusher notify failed:', e.message));
    }

    res.status(201).json(newMessage);
});

// ==========================================
// --- RUTAS DE TIENDA Y RECOMPENSAS ---
// ==========================================

// Reclamar regalo diario (50 GCoins)
app.post('/api/shop/claim_daily_reward', loginRequired, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('gcoins')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const newBalance = (user.gcoins || 0) + 50;
        await supabase
            .from('users')
            .update({ gcoins: newBalance })
            .eq('id', req.user.id);

        res.json({
            message: '¡Has reclamado 50 GCoins con éxito!',
            prize: 50,
            new_balance: newBalance
        });
    } catch (err) {
        console.error('Error al reclamar recompensa diaria:', err);
        res.status(500).json({ message: 'Error al procesar la recompensa diaria.' });
    }
});

// Registrar premio de la ruleta
app.post('/api/shop/spin_roulette', loginRequired, async (req, res) => {
    const { prize_amount } = req.body;
    const prize = parseInt(prize_amount) || 0;

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('gcoins')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const newBalance = Math.max(0, (user.gcoins || 0) + prize);
        await supabase
            .from('users')
            .update({ gcoins: newBalance })
            .eq('id', req.user.id);

        res.json({
            message: `¡Has ganado ${prize} GCoins!`,
            prize,
            new_balance: newBalance
        });
    } catch (err) {
        console.error('Error en giro de ruleta:', err);
        res.status(500).json({ message: 'Error al procesar el premio de la ruleta.' });
    }
});

// Obtener paquetes oficiales de GCoins
app.get('/api/shop/packages', (req, res) => {
    res.json([
        { id: 'pack-500', name: 'Pack Principiante', gcoins: 500, bonus: 0, price_usd: '1.99', popular: false, icon: 'fa-coins' },
        { id: 'pack-1500', name: 'Pack Aventurero', gcoins: 1500, bonus: 200, price_usd: '4.99', popular: true, icon: 'fa-gem' },
        { id: 'pack-5000', name: 'Pack Maestro PvP', gcoins: 5000, bonus: 1000, price_usd: '12.99', popular: false, icon: 'fa-fire' },
        { id: 'pack-12000', name: 'Pack Supremo', gcoins: 12000, bonus: 3500, price_usd: '24.99', popular: false, icon: 'fa-crown' }
    ]);
});

// ==========================================
// --- RUTAS DE ADMINISTRACIÓN ---
// ==========================================

app.get('/api/admin/users', loginRequired, adminRequired, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, nickname, role, is_admin, created_at, gcoins, play_time_seconds, status')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(users);
    } catch (err) {
        console.error('Error al obtener usuarios para admin:', err);
        res.status(500).json({ message: 'Error al obtener usuarios.' });
    }
});

app.get('/api/admin/stats', loginRequired, adminRequired, async (req, res) => {
    try {
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
        res.json({
            total_users: totalUsers || 0,
            server_status: 'Online',
            version: '2.0.0'
        });
    } catch (err) {
        res.status(500).json({ message: 'Error al obtener estadísticas.' });
    }
});

module.exports = { app, loginRequired, adminRequired, publicEndpoint };