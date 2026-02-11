/**
 * Middleware de autenticación JWT
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

/**
 * Middleware que verifica el token JWT en el header Authorization
 * Si el token es válido, adjunta req.user con los datos del usuario
 */
function authMiddleware(req, res, next) {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        // Soporte para SSE (EventSource no permite headers)
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado, inicie sesión nuevamente' });
        }
        return res.status(401).json({ error: 'Token inválido' });
    }
}

module.exports = { authMiddleware };
