/**
 * Seed del usuario por defecto
 * Se ejecuta al iniciar el servidor si no hay usuarios en la BD
 */

const bcrypt = require('bcrypt');
const { getPrismaClient } = require('../prisma/client');
const { logInfo, logSuccess, logError } = require('../utils/logger');

const SALT_ROUNDS = 10;

const DEFAULT_USER = {
    username: 'ventasamurai',
    password: 'Bayona25023',
    nombre: 'Administrador'
};

async function seedDefaultUser() {
    try {
        const prisma = getPrismaClient();
        const count = await prisma.usuario.count();

        if (count === 0) {
            logInfo('🔐 No hay usuarios en la base de datos. Creando usuario por defecto...');
            const passwordHash = await bcrypt.hash(DEFAULT_USER.password, SALT_ROUNDS);

            await prisma.usuario.create({
                data: {
                    username: DEFAULT_USER.username,
                    passwordHash,
                    nombre: DEFAULT_USER.nombre
                }
            });

            logSuccess(`✅ Usuario por defecto creado: ${DEFAULT_USER.username}`);
        } else {
            logInfo(`🔐 ${count} usuario(s) encontrado(s) en la base de datos`);
        }
    } catch (error) {
        logError(`❌ Error al crear usuario por defecto: ${error.message}`);
    }
}

module.exports = { seedDefaultUser };
