require('dotenv').config({ path: '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/.env' });
const { getPrismaClient } = require('/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/prisma/client');
const prisma = getPrismaClient();
async function main() {
  const prod = await prisma.producto.findUnique({ where: { sku: 'KC12071' } });
  
  const actual = await prisma.ventaActual.findMany({ where: { productoId: prod.id } });
  const sumActual = actual.reduce((s, r) => s + r.cantidadVendida, 0);
  console.log('ventaActual mes en curso:', sumActual, 'u (', actual.length, 'filas)');

  const rows3 = await prisma.ventaHistorica.findMany({
    where: { productoId: prod.id, OR: [{ ano:2026, mes:1 },{ ano:2026, mes:2 },{ ano:2026, mes:3 }] }
  });
  const sum3 = rows3.reduce((s, r) => s + r.cantidadVendida, 0);
  console.log('ventaHistorica 3 meses (ene-mar 2026):', sum3, 'u (', rows3.length, 'filas)');
  console.log('sum3 + actual =', sum3 + sumActual, '(match 1067?)');

  const rows2 = await prisma.ventaHistorica.findMany({
    where: { productoId: prod.id, OR: [{ ano:2026, mes:1 },{ ano:2026, mes:2 }] }
  });
  const sum2 = rows2.reduce((s, r) => s + r.cantidadVendida, 0);
  console.log('Solo ene+feb hist:', sum2, '| + actual:', sum2 + sumActual);

  const today = new Date();
  const m = today.getMonth() + 1;
  const y = today.getFullYear();
  console.log('Mes actual del sistema:', y, m);

  await prisma.$disconnect();
}
main().catch(console.error);
